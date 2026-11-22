"""Local document worker. Paths and executables are fixed by the desktop application."""

import json
import re
import shutil
import sys
import tempfile
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from openpyxl import load_workbook
from PIL import Image

from paged import run_paged
from sheets import run_sheets


def printed_value(value, code):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Sì" if value else "No"
    if isinstance(value, str):
        return value
    number = Decimal(str(value))
    if code.lower() == "general":
        return format(number, "f").replace(".", ",")
    # Explicitly supported print formats. Never silently misprint a custom Excel format.
    code = code.replace('"', "").replace("\\", "").strip()
    match = re.fullmatch(r"(€\s*)?(#,##)?0(?:\.(0{1,6}))?(\s*€|%)?", code)
    if not match or (match[1] and match[4]):
        raise ValueError(f"Formato non disponibile per la tabella stampata: {code}")
    places = len(match[3] or "")
    if match[4] == "%":
        number *= 100
    number = number.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
    result = format(number, f"{',' if match[2] else ''}.{places}f").translate(str.maketrans(",.", ".,"))
    return (match[1] or "") + result + (match[4] or "")


def table_from_workbook(spec, filename, name):
    book = load_workbook(filename, data_only=True, read_only=True)
    try:
        sheet = book[name]
        definition = next(item for item in spec["sheets"] if item["name"] == name)
        columns = definition["columns"]
        formats = definition.get("numberFormats", [])
        rows = []
        for row in sheet.iter_rows(min_row=2, max_row=1 + len(definition["rows"]), max_col=len(columns), values_only=True):
            rows.append([printed_value(value, formats[i] if i < len(formats) else "General") for i, value in enumerate(row)])
        return {**spec, "columns": columns, "rows": rows}
    finally:
        book.close()


def generate(request, work):
    spec, formats, theme = request["document"], request["formats"], request["theme"]
    if theme.get("logo"):
        with Image.open("/input/logo.png", formats=["PNG"]) as logo:
            if logo.width * logo.height > 8_000_000 or getattr(logo, "n_frames", 1) != 1:
                raise ValueError("Il logo deve essere un PNG statico fino a 8 megapixel.")
            normalized = work / "logo.png"
            logo.convert("RGBA").save(normalized)
            theme["logo"] = str(normalized)
    result = {"status": "verified", "template": theme["name"], "engines": [], "checks": [], "pages": 0, "previews": [], "files": []}
    sheet_name = spec.get("tableFromSheet")
    if "xlsx" in formats or sheet_name:
        excel = run_sheets(spec, work, theme)
        result["engines"].append(excel["engine"])
        result["checks"].extend(excel["checks"])
        if sheet_name:
            spec = table_from_workbook(spec, work / "workbook.xlsx", sheet_name)
            result["checks"].append("Tabella impaginata ricavata dai valori ricalcolati del foglio " + sheet_name + ".")
        if "xlsx" in formats:
            result["files"].append("workbook.xlsx")
            result["previews"].extend(excel["previews"])
    if "pdf" in formats or "docx" in formats:
        paged = run_paged(spec, formats, work, theme)
        result["engines"].append(paged["engine"])
        result["checks"].extend(paged["checks"])
        result["pages"] = paged["pages"]
        result["previews"] = paged["previews"] + result["previews"]
        result["files"].extend("document." + fmt for fmt in formats if fmt in ("docx", "pdf"))
    return result


def main():
    request = json.loads(Path("/input/request.json").read_text(encoding="utf-8"))
    output = Path("/output")
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        result = generate(request, work)
        names = result["files"] + result["previews"]
        if len(names) > 150 or sum((work / name).stat().st_size for name in names) > 120 * 1024 * 1024:
            raise ValueError("Consegna oltre 150 file o 120 MiB. Suddividere il documento.")
        for name in names:
            shutil.copyfile(work / name, output / name)
        (output / "receipt.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("Documenti: " + str(error)[:1400], file=sys.stderr)
        sys.exit(1)
