"""Check the delivered files independently of the Agent-Lab Office worker."""

import json
import re
import subprocess
import sys
import tempfile
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from docx import Document
from openpyxl import load_workbook
from PIL import Image, ImageChops, ImageStat


def check(condition, message):
    if not condition:
        raise ValueError(message)


def flat(text):
    return " ".join(text.split())


def amount(cents):
    return f"{cents // 100:,}".replace(",", ".") + f",{cents % 100:02}"


def cents(value):
    return int((Decimal(str(value)) * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def expected(spec, edited=False):
    rows = []
    for index, item in enumerate(spec["items"]):
        quantity = spec["editedQuantity"] if edited and index == 0 else item["quantity"]
        rows.append(
            (
                item["code"],
                flat(item["label"]),
                quantity,
                item["unitCents"],
                quantity * item["unitCents"],
            )
        )
    subtotal = sum(row[-1] for row in rows)
    tax = int(
        (Decimal(subtotal * spec["taxPercent"]) / 100).quantize(
            Decimal(1), rounding=ROUND_HALF_UP
        )
    )
    totals = [
        ("Imponibile", subtotal),
        ("IVA", tax),
        ("Totale preventivo", subtotal + tax),
    ]
    return rows, totals


def money_in(text, value):
    return (
        re.search(r"(?<![\d.,])" + re.escape(amount(value)) + r"(?![\d.,])", text)
        is not None
        and "€" in text
    )


def check_docx(path, spec, items, totals):
    doc = Document(path)
    paragraphs = [flat(p.text) for p in doc.paragraphs]
    check(
        spec["title"] in paragraphs
        and all(text in paragraphs for text in spec["paragraphs"] + spec["summary"]),
        "Word: titolo o paragrafo assente",
    )
    check("Officina Demo" in paragraphs, "Word: organizzazione del modello assente")
    check(
        any(
            "Dati sintetici" in p.text
            for section in doc.sections
            for p in section.footer.paragraphs
        ),
        "Word: piè di pagina del modello assente",
    )
    rows = [
        [flat(cell.text) for cell in row.cells]
        for table in doc.tables
        for row in table.rows
    ]
    body = [r for r in rows if r != spec["columns"]]
    check(
        len(body) == len(items) + len(totals),
        "Word: numero righe diverso dalla fixture",
    )
    for row, (code, label, quantity, unit, total) in zip(body, items):
        check(
            code in row[0] and label in row[0] and row[1] == str(quantity),
            f"Word: descrizione o quantità errata per {code}",
        )
        check(
            money_in(row[2], unit) and money_in(row[3], total),
            f"Word: importo errato per {code}",
        )
    for row, (label, value) in zip(body[len(items) :], totals):
        check(
            label in row[0] and money_in(row[3], value),
            f"Word: riepilogo errato per {label}",
        )
    return len(body)


def read_pdf_page(file, index):
    return subprocess.check_output(
        ["pdftotext", "-f", str(index), "-l", str(index), "-layout", str(file), "-"],
        text=True,
        encoding="utf-8",
    )


def check_pdf(file, spec, items, totals, scratch, compare_previews=True):
    info = subprocess.check_output(["pdfinfo", str(file)], text=True, encoding="utf-8")
    check(
        re.search(r"^Pages:\s+2\s*$", info, re.M),
        "PDF: il preventivo deve avere esattamente due pagine",
    )
    pages = [read_pdf_page(file, 1), read_pdf_page(file, 2)]
    check(
        spec["title"] in flat(pages[0])
        and all(
            p in flat(" ".join(pages)) for p in spec["paragraphs"] + spec["summary"]
        ),
        "PDF: manca testo del documento",
    )
    check(
        "Officina Demo" in flat(pages[0])
        and all("Dati sintetici" in flat(page) for page in pages),
        "PDF: intestazione o piè di pagina del modello assenti",
    )
    cut = spec["pageBreakBeforeRows"][0]
    for i, (code, label, quantity, unit, total) in enumerate(items):
        group = 0 if i < cut else 1
        page = pages[group]
        check(
            page.count(code) == 1 and code not in pages[1 - group],
            f"PDF: {code} nella pagina sbagliata o duplicato",
        )
        line = next(text for text in page.splitlines() if code in text)
        next_code = items[i + 1][0] if i + 1 < len(items) and i + 1 != cut else None
        section = (
            page.split(code, 1)[1].split(next_code, 1)[0]
            if next_code
            else page.split(code, 1)[1]
        )
        for term in label.split():
            check(
                re.search(r"\b" + re.escape(term) + r"\b", section, re.I),
                f"PDF: testo incompleto per {code}",
            )
        line_values = re.findall(r"(?<![\d.,])\d[\d.]*,\d\d(?!\d)", section)
        check(
            re.search(r"(?<![\d.,])" + str(quantity) + r"(?![\d.,])", section)
            and line_values[:2] == [amount(unit), amount(total)]
            and "€" in section,
            f"PDF: quantità o cifra errata per {code}: {line}",
        )
    for label, value in totals:
        line = next((text for text in pages[1].splitlines() if label in text), "")
        check(money_in(line, value), f"PDF: riepilogo errato per {label}")
    if not compare_previews:
        return 2
    preview_data = []
    for i in (1, 2):
        preview_path = file.parent / f"page-{i:03}.png"
        with Image.open(preview_path) as preview:
            check(
                preview.format == "PNG" and min(preview.size) >= 300,
                f"Anteprima pagina {i} illeggibile",
            )
            prefix = scratch / f"audit-page-{i}"
            subprocess.run(
                [
                    "pdftoppm",
                    "-f",
                    str(i),
                    "-l",
                    str(i),
                    "-singlefile",
                    "-png",
                    "-scale-to-x",
                    str(preview.width),
                    "-scale-to-y",
                    str(preview.height),
                    str(file),
                    str(prefix),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            with Image.open(prefix.with_suffix(".png")) as rendered:
                size = (96, 128)
                actual = preview.convert("L").resize(size, Image.Resampling.LANCZOS)
                reference = rendered.convert("L").resize(size, Image.Resampling.LANCZOS)
                difference = ImageStat.Stat(
                    ImageChops.difference(actual, reference)
                ).mean[0]
                non_white = sum(actual.histogram()[:230]) / (size[0] * size[1])
                check(
                    difference < 7 and non_white > 0.025,
                    f"Anteprima {i} non corrisponde al PDF o pagina vuota",
                )
                preview_data.append(
                    {
                        "page": i,
                        "pixels": list(preview.size),
                        "meanDifference": round(difference, 3),
                        "inkFraction": round(non_white, 3),
                    }
                )
    return preview_data


def check_sheet(path, spec, items, totals):
    formulas = load_workbook(path, data_only=False)
    values = load_workbook(path, data_only=True)
    try:
        check(
            formulas.sheetnames == ["Preventivo"]
            and values.sheetnames == formulas.sheetnames,
            "XLSX: elenco fogli inatteso",
        )
        cells, cached = formulas.active, values.active
        check(
            [c.value for c in cells[1]][:4] == spec["columns"],
            "XLSX: intestazione errata",
        )
        for i, (code, description, quantity, unit, total) in enumerate(items, start=2):
            check(
                code in str(cells[f"A{i}"].value)
                and description in flat(str(cells[f"A{i}"].value)),
                f"XLSX: descrizione {code} errata",
            )
            check(
                cached[f"B{i}"].value == quantity
                and cents(cached[f"C{i}"].value) == unit,
                f"XLSX: quantità/prezzo {code} errati",
            )
            check(
                cells[f"D{i}"].data_type == "f"
                and cents(cached[f"D{i}"].value) == total,
                f"XLSX: formula/cache {code} errata",
            )
            check(
                "€" in cells[f"C{i}"].number_format
                and "€" in cells[f"D{i}"].number_format,
                f"XLSX: formato valuta {code} mancante",
            )
        for i, (label, val) in enumerate(totals, start=len(items) + 2):
            check(
                label in str(cells[f"A{i}"].value)
                and cells[f"D{i}"].data_type == "f"
                and cents(cached[f"D{i}"].value) == val,
                f"XLSX: formula o valore {label} errato",
            )
    finally:
        formulas.close()
        values.close()


def recalc_copy(workbook, spec, scratch):
    edited_items, edited_totals = expected(spec, edited=True)
    clone = scratch / "input" / "edit.xlsx"
    target = scratch / "recalculated"
    clone.parent.mkdir()
    target.mkdir()
    book = load_workbook(workbook)
    try:
        book.active["B2"] = spec["editedQuantity"]
        book.save(clone)
    finally:
        book.close()
    subprocess.run(
        [
            "soffice",
            "-env:UserInstallation=" + (scratch / "lo-profile").as_uri(),
            "--headless",
            "--convert-to",
            "xlsx",
            "--outdir",
            str(target),
            str(clone),
        ],
        check=True,
        capture_output=True,
        timeout=75,
    )
    check_sheet(target / clone.name, spec, edited_items, edited_totals)
    return {label: amount(value) for label, value in edited_totals}


def main():
    delivery = Path(sys.argv[1])
    spec = json.loads(
        Path(__file__).with_name("preventivo.json").read_text(encoding="utf-8")
    )
    items, totals = expected(spec)
    with tempfile.TemporaryDirectory() as tmp:
        scratch = Path(tmp)
        count = check_docx(delivery / "document.docx", spec, items, totals)
        previews = check_pdf(delivery / "document.pdf", spec, items, totals, scratch)
        subprocess.run(
            [
                "soffice",
                "-env:UserInstallation=" + (scratch / "word-profile").as_uri(),
                "--headless",
                "--convert-to",
                "pdf:writer_pdf_Export",
                "--outdir",
                str(scratch),
                str(delivery / "document.docx"),
            ],
            check=True,
            capture_output=True,
            timeout=75,
        )
        word_pages = check_pdf(
            scratch / "document.pdf",
            spec,
            items,
            totals,
            scratch,
            compare_previews=False,
        )
        file = delivery / "workbook.xlsx"
        check_sheet(file, spec, items, totals)
        edited = recalc_copy(file, spec, scratch)
    print(
        json.dumps(
            {
                "rowsIncludingTotals": count,
                "docxRenderedPages": word_pages,
                "pages": previews,
                "documentTotals": {label: amount(value) for label, value in totals},
                "independentRecalculation": edited,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
