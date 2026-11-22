"""Build an XLSX from typed cells and verify its numerical behaviour in LibreOffice Calc."""

import math
import os
import re
import shutil
import subprocess
import tempfile
import unicodedata
import xml.etree.ElementTree as ET
from graphlib import CycleError, TopologicalSorter
from pathlib import Path
from zipfile import ZipFile

from openpyxl import Workbook, load_workbook
from openpyxl.drawing.image import Image as SheetImage
from openpyxl.formula import Tokenizer
from openpyxl.formula.tokenizer import Token, TokenizerError
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import column_index_from_string, get_column_letter

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
CELL = re.compile(r"\$?([A-Z]{1,3})\$?([1-9][0-9]{0,6})", re.ASCII | re.I)
NUMBER = re.compile(r"(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?", re.ASCII)
FORMAT = re.compile(r'(?:["\\]?[$€£]["\\]? ?)?(?:#,##0|0)(?:\.0{1,6})?(?:%| ?["\\]?[$€£]"?)?')
FUNCTIONS = {"SUM", "PRODUCT", "AVERAGE", "MIN", "MAX", "COUNT", "ROUND", "ROUNDUP", "ROUNDDOWN", "ABS"}
MAX_CELLS = 100_000
MAX_REFERENCES = 1_000_000
ET.register_namespace("", NS)
ET.register_namespace("r", REL)


def _text(value, label, limit=32767):
    if (not isinstance(value, str) or len(value) > limit or
            any(not (c in "\t\n\r" or 32 <= ord(c) <= 0xD7FF or 0xE000 <= ord(c) <= 0xFFFD or 0x10000 <= ord(c) <= 0x10FFFF) for c in value)):
        raise ValueError(f"{label}: testo non valido o troppo lungo.")
    return value


def _numeric(value):
    return type(value) in (int, float) and abs(value) <= 1.7976931348623157e308 and math.isfinite(value)


def _equal(a, b):
    return math.isclose(a, b, rel_tol=1e-12, abs_tol=1e-12)


def _coordinate(text, rows, cols):
    match = CELL.fullmatch(text) if isinstance(text, str) else None
    if match:
        row, col = int(match[2]), column_index_from_string(match[1].upper())
        if row <= rows and col <= cols:
            return row, col
    raise ValueError("La cella deve essere un riferimento A1 interno alla tabella del foglio.")


def _formula(source, rows, cols, budget):
    """Only scalar arithmetic with local cells and a small list of numerical functions; no Excel names."""
    expression = _text(source, "Formula", 1024).strip()
    try:
        tokens = Tokenizer(expression if expression.startswith("=") else "=" + expression).items
    except (TokenizerError, IndexError) as exc:
        raise ValueError("Formula Excel non valida.") from exc
    if not tokens or len(tokens) > 256:
        raise ValueError("Formula Excel vuota o troppo complessa.")
    references, pieces, stack = set(), [], []
    operand = True
    for token in tokens:
        kind, sub, value = token.type, token.subtype, token.value
        if kind == Token.WSPACE:
            continue
        if kind == "OPERAND" and operand and sub == "NUMBER" and NUMBER.fullmatch(value) and _numeric(float(value)):
            operand = False
        elif kind == "OPERAND" and operand and sub == "RANGE":
            ends = value.upper().split(":")
            if len(ends) not in (1, 2):
                raise ValueError("Intervallo Excel non valido.")
            top, left = _coordinate(ends[0], rows, cols)
            bottom, right = _coordinate(ends[-1], rows, cols)
            if top > bottom or left > right:
                raise ValueError("Intervallo Excel invertito.")
            budget[0] -= (bottom - top + 1) * (right - left + 1)
            if budget[0] < 0:
                raise ValueError("Troppi riferimenti di cella nel workbook.")
            references.update((r, c) for r in range(top, bottom + 1) for c in range(left, right + 1))
            value, operand = value.upper(), False
        elif kind in {"FUNC", "PAREN"} and sub == "OPEN" and operand:
            if kind == "FUNC" and value[:-1].upper() not in FUNCTIONS:
                raise ValueError("Funzione Excel non consentita.")
            stack.append(kind)
            value = value.upper()
        elif kind in {"FUNC", "PAREN"} and sub == "CLOSE" and not operand and stack and stack.pop() == kind:
            pass
        elif kind == Token.OP_PRE and operand and value in {"+", "-"}:
            pass
        elif kind == Token.OP_POST and not operand and value == "%":
            pass
        elif not operand and ((kind == Token.OP_IN and value in {"+", "-", "*", "/", "^"}) or
                              (kind == "SEP" and sub == "ARG" and value == "," and stack and stack[-1] == "FUNC")):
            operand = True
        else:
            raise ValueError("Formula non consentita: usa numeri, celle locali, intervalli e funzioni aritmetiche supportate.")
        pieces.append(value)
    if operand or stack:
        raise ValueError("Formula Excel incompleta.")
    return "=" + "".join(pieces), references


def _format(value):
    if value == "General":
        return value
    if isinstance(value, str) and len(value) <= 64:
        positive, *negative = value.split(";")
        if FORMAT.fullmatch(positive) and (not negative or negative in ([f"({positive})"], [f"-{positive}"])):
            return value
    raise ValueError("Formato numerico non supportato.")


def _ink(accent):
    rgb = [int(accent[i:i+2], 16) / 255 for i in (0, 2, 4)]
    linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055)**2.4 for v in rgb]
    luminance = sum(n * w for n, w in zip(linear, (0.2126, 0.7152, 0.0722)))
    return "FFFFFF" if luminance < 0.179 else "000000"


def _width(text):
    return max((sum(2 if unicodedata.east_asian_width(c) in "FW" else 1 for c in line) for line in str(text).splitlines()), default=0)


def _put_text(cell, text):
    cell.value = _text(text, "Cella")
    cell.data_type = "s"  # Including strings beginning with '=' or Excel error literals.


def _build(spec, theme, outdir):
    title = _text(spec.get("title"), "Titolo", 255)
    sheets = spec.get("sheets")
    if not isinstance(sheets, list) or not 1 <= len(sheets) <= 32:
        raise ValueError("Servono da 1 a 32 fogli.")
    accent = theme.get("accent")
    if not isinstance(accent, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", accent):
        raise ValueError("Colore del modello non valido.")
    accent = accent[1:].upper()
    book = Workbook()
    book.remove(book.active)
    book.properties.title = title
    organization = _text(theme.get("organization") or "", "Organizzazione", 240)
    footer = _text(theme.get("footer") or "", "Piè di pagina", 240)
    book.properties.creator = organization or "Agent-Lab"
    logo = theme.get("logo")
    if logo and (not isinstance(logo, str) or Path(logo).is_symlink() or Path(logo).absolute() not in {(outdir / "logo.png").absolute(), Path("/input/logo.png")}):
        raise ValueError("Logo del modello non autorizzato.")
    expected, probes, used_names = {}, {}, set()
    budget, cell_count = [MAX_REFERENCES], 0
    for definition in sheets:
        name = _text(definition.get("name"), "Nome del foglio", 31)
        if (not name.strip() or re.search(r"[\[\]:*?/\\\r\n\t]", name) or name.startswith("'") or name.endswith("'")
                or name.casefold() in used_names or name.casefold() == "history"):
            raise ValueError("Nome del foglio non valido o duplicato.")
        used_names.add(name.casefold())
        columns, data = definition.get("columns"), definition.get("rows")
        if not isinstance(columns, list) or not 1 <= len(columns) <= 256 or not isinstance(data, list):
            raise ValueError(f"{name}: colonne o righe non valide.")
        rmax, cmax = len(data) + 1, len(columns)
        cell_count += rmax * cmax
        if cell_count > MAX_CELLS:
            raise ValueError(f"Il workbook supera {MAX_CELLS} celle.")
        formats = definition.get("numberFormats", [])
        if not isinstance(formats, list) or len(formats) > cmax:
            raise ValueError(f"{name}: formati non allineati alle colonne.")
        formats = [_format(f) for f in formats] + ["General"] * (cmax - len(formats))
        ws = book.create_sheet(name)
        ws.sheet_view.showGridLines = False
        ws.freeze_panes = "A2"
        ws.sheet_properties.pageSetUpPr.fitToPage = True
        ws.sheet_properties.tabColor = accent
        ws.page_setup.orientation = "landscape" if cmax > 4 else "portrait"
        ws.page_setup.paperSize = ws.PAPERSIZE_A4
        ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0
        ws.print_title_rows = "1:1"
        ws.oddHeader.left.text = organization.replace("&", "&&")
        ws.oddHeader.center.text = title.replace("&", "&&")
        ws.oddFooter.left.text = footer.replace("&", "&&")
        ws.auto_filter.ref = f"A1:{get_column_letter(cmax)}{rmax}"
        header_fill = PatternFill("solid", fgColor=accent)
        header_font = Font(name="Liberation Sans", size=11, bold=True, color=_ink(accent))
        widths = []
        for col, value in enumerate(columns, 1):
            cell = ws.cell(1, col)
            _put_text(cell, value)
            if not value.strip():
                raise ValueError(f"{name}: intestazione vuota.")
            cell.font, cell.fill = header_font, header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            widths.append(max(11, min(54, _width(value) + 4)))
        ws.row_dimensions[1].height = 32
        graph = TopologicalSorter()
        expected[name] = {}
        heights = {}
        for row, values in enumerate(data, 2):
            if not isinstance(values, list) or len(values) > cmax:
                raise ValueError(f"{name}: riga {row} non allineata alle colonne.")
            for col, value in enumerate(values, 1):
                if value is None:
                    continue
                cell = ws.cell(row, col)
                if isinstance(value, dict):
                    if value.keys() != {"formula", "expected"} or not _numeric(value["expected"]):
                        raise ValueError("Ogni formula deve indicare un risultato numerico atteso.")
                    expression, refs = _formula(value["formula"], rmax, cmax, budget)
                    graph.add((row, col), *refs)
                    cell.value = expression
                    expected[name][cell.coordinate] = value["expected"]
                    display = value["expected"]
                elif isinstance(value, str):
                    _put_text(cell, value)
                    display = value
                elif isinstance(value, bool) or _numeric(value):
                    cell.value, display = value, value
                else:
                    raise ValueError(f"{name}!{cell.coordinate}: tipo di cella non supportato.")
                cell.number_format = formats[col-1]
                cell.font = Font(name="Liberation Sans", size=10, color="202A34" if isinstance(value, (dict,str)) else "234579")
                cell.alignment = Alignment(horizontal="left" if isinstance(value, str) else "right", vertical="center", wrap_text=isinstance(value,str))
                widths[col-1] = max(widths[col-1], min(54, _width(display) + (2 if isinstance(value,str) else 6)))
                if isinstance(value, str):
                    heights[row] = max(heights.get(row, 1), sum(max(1, math.ceil(_width(line) / 50)) for line in value.split("\n")))
        try:
            graph.prepare()
        except CycleError as exc:
            raise ValueError(f"{name}: le formule contengono un riferimento circolare.") from exc
        for col, width in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(col)].width = width
        for row, lines in heights.items():
            if lines > 1:
                ws.row_dimensions[row].height = min(400, 15 * lines)
        if logo:
            picture = SheetImage(logo)
            scale = min(1.0, 100 / picture.width, 38 / picture.height)
            picture.width, picture.height = round(picture.width * scale), round(picture.height * scale)
            ws.add_image(picture, f"{get_column_letter(cmax + 2)}1")
        test = definition.get("inputCheck")
        if not expected[name] and test is None:
            continue
        if not isinstance(test, dict) or not _numeric(test.get("value")) or not isinstance(test.get("expect"), list) or not test["expect"]:
            raise ValueError(f"{name}: occorre inputCheck con un input e risultati formula attesi.")
        ri, ci = _coordinate(test.get("cell"), rmax, cmax)
        driver = ws.cell(ri, ci)
        if not _numeric(driver.value) or _equal(driver.value, test["value"]):
            raise ValueError(f"{name}: inputCheck deve cambiare un input numerico distinto da una formula.")
        checks = {}
        for item in test["expect"]:
            if not isinstance(item,dict) or not _numeric(item.get("value")):
                raise ValueError(f"{name}: risultato di inputCheck non valido.")
            rr, cc = _coordinate(item.get("cell"), rmax, cmax)
            coord = ws.cell(rr, cc).coordinate
            if coord not in expected[name] or coord in checks:
                raise ValueError(f"{name}: inputCheck deve controllare celle formula distinte.")
            checks[coord] = item["value"]
        if not any(not _equal(n, expected[name][coord]) for coord,n in checks.items()):
            raise ValueError(f"{name}: inputCheck deve prevedere almeno un risultato diverso dalla base.")
        probes[name] = (driver.coordinate, test["value"], checks)
    return book, expected, probes


def _run(args, error, timeout=90, *, env=None):
    try:
        result = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout, check=False, env=env)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ValueError(error) from exc
    if result.returncode != 0:
        raise ValueError(error)
    return result.stdout


def _read_results(filename, expected):
    result = {}
    with ZipFile(filename) as zipfile:
        for index, (name, checks) in enumerate(expected.items(), 1):
            sheet = ET.fromstring(zipfile.read(f"xl/worksheets/sheet{index}.xml"))
            observed = {}
            for c in sheet.iter(f"{{{NS}}}c"):
                addr = c.get("r")
                if addr not in checks:
                    continue
                v = c.findtext(f"{{{NS}}}v")
                if c.find(f"{{{NS}}}f") is None or c.get("t","n") != "n" or v is None or not NUMBER.fullmatch(v.lstrip("-")):
                    raise ValueError(f"{name}!{addr}: risultato formula assente o non numerico.")
                value = float(v)
                if not _numeric(value) or not _equal(value, checks[addr]):
                    raise ValueError(f"{name}!{addr}: risultato calcolato diverso dall'atteso.")
                observed[addr] = v
            if observed.keys() != checks.keys():
                raise ValueError(f"{name}: formule mancanti dopo il ricalcolo.")
            result[name] = observed
    return result


def _write_caches(source, target, results):
    # Keep the original formatting, text types and media. Transplant only Calc's verified numeric OOXML values.
    sheets = {f"xl/worksheets/sheet{i}.xml": values for i, values in enumerate(results.values(), 1) if values}
    with ZipFile(source) as original, ZipFile(target, "w") as final:
        for entry in original.infolist():
            raw = original.read(entry)
            if entry.filename in sheets:
                sheet = ET.fromstring(raw)
                for c in sheet.iter(f"{{{NS}}}c"):
                    if c.get("r") in sheets[entry.filename]:
                        c.find(f"{{{NS}}}v").text = sheets[entry.filename][c.get("r")]
                raw = ET.tostring(sheet, encoding="utf-8", xml_declaration=True)
            final.writestr(entry, raw)


def run_sheets(spec, outdir, theme):
    """Write workbook.xlsx and one bounded PNG preview per worksheet in the job's private output directory."""
    outdir = Path(outdir)
    book, expected, probes = _build(spec, theme, outdir)
    with tempfile.TemporaryDirectory(prefix="agentlab-calc-") as tmp:
        temp = Path(tmp)
        calc = temp / "converted"
        calc.mkdir()
        source, final = temp / "source.xlsx", temp / "workbook.xlsx"
        book.save(source)
        book.close()
        tasks = [source]
        if probes:
            mutated = load_workbook(source)
            for name,(cell,value,_) in probes.items():
                mutated[name][cell] = value
            alternate = temp / "changed.xlsx"
            mutated.save(alternate)
            mutated.close()
            tasks.append(alternate)
        office = ["soffice", "-env:UserInstallation=" + (temp / "profile").as_uri(), "--headless", "--nologo", "--norestore"]
        _run([*office, "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", str(calc), *(str(f) for f in tasks)], "LibreOffice Calc non ha completato il ricalcolo.")
        if not all((calc / f.name).is_file() for f in tasks):
            raise ValueError("LibreOffice Calc non ha prodotto il workbook ricalcolato.")
        results = _read_results(calc / source.name, expected)
        if probes:
            _read_results(calc / alternate.name, {name: probes[name][2] if name in probes else {} for name in expected})
        _write_caches(source, final, results)
        _read_results(final, expected)
        reopened = load_workbook(final)
        cached = load_workbook(final, data_only=True)
        try:
            if reopened.sheetnames != list(expected) or cached.sheetnames != list(expected):
                raise ValueError("I fogli riaperti non corrispondono al modello.")
            for name, cells in expected.items():
                for coord, wanted in cells.items():
                    if reopened[name][coord].data_type != "f" or not _numeric(cached[name][coord].value) or not _equal(cached[name][coord].value, wanted):
                        raise ValueError(f"{name}!{coord}: verifica finale formula o cache non riuscita.")
        finally:
            reopened.close()
            cached.close()

        # Real Calc rendering. SinglePageSheets gives one page per tab; crop the upper-left viewport at a readable DPI.
        _run([*office, "--convert-to", 'pdf:calc_pdf_Export:{"SinglePageSheets":{"type":"boolean","value":"true"}}', "--outdir", str(calc), str(final)],
             "Anteprima Calc non riuscita.", env={**os.environ, "LC_ALL": "it_IT.UTF-8"})
        pdf = calc / "workbook.pdf"
        info = _run(["pdfinfo", str(pdf)], "PDF di anteprima Calc illeggibile.")
        pages = re.search(rb"^Pages:\s*(\d+)", info, re.M)
        if not pages or int(pages[1]) != len(expected):
            raise ValueError("Numero di pagine anteprima diverso dal numero di fogli.")
        previews = []
        for i in range(1, len(expected)+1):
            stem = f"sheet-{i:03d}"
            _run(["pdftoppm", "-f", str(i), "-l", str(i), "-r", "110", "-x", "0", "-y", "0", "-W", "1700", "-H", "1200", "-singlefile", "-png", str(pdf), str(temp / stem)], "Rendering del foglio non riuscito.")
            name = stem + ".png"
            with (temp / name).open("rb") as f:
                if f.read(8) != b"\x89PNG\r\n\x1a\n":
                    raise ValueError("Anteprima PNG del foglio non valida.")
            previews.append(name)
        for name in ["workbook.xlsx", *previews]:
            with (temp/name).open("rb") as inp, (outdir/name).open("xb") as dest:
                shutil.copyfileobj(inp, dest)
    checks = [f"{len(expected)} fogli riaperti; {sum(map(len,expected.values()))} formule e valori attesi verificati con Calc."]
    checks.extend(f"{name}: cambiato {cell} in copia e verificati {len(values)} risultati." for name,(cell,_,values) in probes.items())
    checks.append("Una anteprima PNG per foglio; per tabelle ampie è mostrata la parte iniziale.")
    return {"checks": checks, "previews": previews, "engine": "openpyxl / LibreOffice Calc"}
