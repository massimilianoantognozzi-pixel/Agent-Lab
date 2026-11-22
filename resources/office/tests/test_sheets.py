"""The integration tests require the same LibreOffice Calc and Poppler tools as the worker."""

import hashlib
import math
import subprocess
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from zipfile import ZipFile

from openpyxl import load_workbook
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sheets import _build, _run, run_sheets


def sample():
    return {
        "title": "Verifica elaborazione",
        "sheets": [
            {"name": "Ordini", "columns": ["Voce", "Qtà", "Prezzo", "Totale"],
             "numberFormats": ["General", "0", '#,##0.00 "€"', '#,##0.00 "€"'],
             "rows": [
                 ["Fornitura", 3, 9.5, {"formula": "=B2 * C2", "expected": 28.5}],
                 ["=testo letterale", 2, 7, {"formula": "=B3*C3", "expected": 14}],
                 ["Riepilogo", None, None, {"formula": "=SUM($D$2:D3)", "expected": 42.5}],
             ],
             "inputCheck": {"cell": "B2", "value": 4, "expect": [{"cell": "D2", "value": 38}, {"cell":"D4","value":52}]}},
            {"name": "Note", "columns": ["Descrizione", "Valido"],
             "rows": [["#REF!",True],["https://example.invalid/", False]]},
        ],
    }


class WorkbookFixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        self.theme = {"name":"Chiaro", "accent":"#FBDD55","organization":"A&B", "footer":"Prova"}


class SheetWorkerTests(WorkbookFixture):
    def test_invalid_formulas_are_rejected_before_office(self):
        for expression in ['=HYPERLINK("https://example.invalid")',"=[Other.xlsx]Sheet!A2",
                           "=INDIRECT(A2)", "=SUM(A2:A900000)", "=D2", "=A2 B2", "=1/"]:
            with self.subTest(expression=expression), self.assertRaises(ValueError):
                spec=sample()
                spec["sheets"][0]["rows"][0][3]["formula"]=expression
                _build(spec,self.theme,self.path)

    def test_malformed_input_checks_cannot_pass(self):
        checks=[None,{"cell":"D2","value":4,"expect":[{"cell":"D4","value":52}]},
                {"cell":"B2","value":3,"expect":[{"cell":"D2","value":38}]},
                {"cell":"B2","value":4,"expect":[{"cell":"D2","value":28.5}]}]
        for check in checks:
            with self.subTest(check=check),self.assertRaises(ValueError):
                spec=sample();spec["sheets"][0]["inputCheck"]=check
                _build(spec,self.theme,self.path)

    def test_bad_values_and_duplicate_sheet_names(self):
        for bad in [math.nan,math.inf,{"formula":"=B2", "expected":False}, "a\0b"]:
            with self.subTest(bad=bad),self.assertRaises(ValueError):
                spec=sample();spec["sheets"][0]["rows"][0][0]=bad
                _build(spec,self.theme,self.path)
        spec=sample();spec["sheets"][1]["name"]="ORDINI"
        with self.assertRaises(ValueError):
            _build(spec,self.theme,self.path)


@unittest.skipUnless(shutil.which("soffice") and shutil.which("pdftoppm"), "requires the document worker runtime")
class RealCalcTests(WorkbookFixture):
    def test_recalculation_mutation_previews_and_logo(self):
        logo=self.path/"logo.png"
        Image.new("RGBA",(80,32),(25,95,160,255)).save(logo)
        self.theme["logo"]=str(logo)
        report=run_sheets(sample(),self.path,self.theme)
        self.assertEqual(report["previews"],["sheet-001.png","sheet-002.png"])
        for name in report["previews"]:
            with Image.open(self.path/name) as preview:
                self.assertEqual(preview.format,"PNG")
                self.assertLessEqual(preview.width,1700);self.assertLessEqual(preview.height,1200)
                self.assertTrue(any(lo!=hi for lo,hi in preview.convert("RGB").getextrema()))
        path=self.path/"workbook.xlsx";book=load_workbook(path);cached=load_workbook(path,data_only=True)
        try:
            self.assertEqual(book.sheetnames,["Ordini","Note"])
            self.assertEqual(book["Ordini"]["D2"].value,"=B2*C2")
            self.assertEqual(book["Ordini"]["D4"].value,"=SUM($D$2:D3)")
            self.assertEqual([cached["Ordini"][c].value for c in ("B2","D2","D3","D4")],[3,28.5,14,42.5])
            self.assertEqual(book["Ordini"]["A3"].data_type,"s");self.assertEqual(book["Note"]["A2"].data_type,"s")
            self.assertIsNone(book["Note"]["A3"].hyperlink);self.assertIs(book["Note"]["B2"].value,True)
            self.assertEqual(book["Ordini"].freeze_panes,"A2")
            self.assertEqual(book["Ordini"]["A1"].font.color.rgb[-6:],"000000")
            self.assertGreater(book["Ordini"]._images[0].anchor._from.col,3)
            with ZipFile(path) as archive:
                media=[part for part in archive.namelist() if part.startswith("xl/media/")]
                self.assertEqual(len(media),2)
                self.assertTrue(all(archive.read(part)==logo.read_bytes() for part in media))
        finally:
            book.close();cached.close()

    def test_italian_preview_does_not_change_the_workbook(self):
        evidence = {}
        def observe(args, *rest, **kwargs):
            if not any(str(arg).startswith("pdf:calc_pdf_Export") for arg in args):
                return _run(args, *rest, **kwargs)
            source = Path(args[-1])
            evidence["before"] = hashlib.sha256(source.read_bytes()).hexdigest()
            result = _run(args, *rest, **kwargs)
            pdf = Path(args[args.index("--outdir") + 1]) / (source.stem + ".pdf")
            evidence["text"] = subprocess.check_output(["pdftotext", "-layout", str(pdf), "-"]).decode("utf-8")
            return result

        fmt = '#,##0.00 "€"'
        spec = {"title": "Prova importo", "sheets": [{"name": "Totale", "columns": ["Importo"],
                "numberFormats": [fmt], "rows": [[1859.16]]}]}
        with patch("sheets._run", side_effect=observe):
            run_sheets(spec, self.path, self.theme)
        self.assertRegex(evidence["text"], r"1\.859,16\s*€")
        file = self.path / "workbook.xlsx"
        self.assertEqual(evidence["before"], hashlib.sha256(file.read_bytes()).hexdigest())
        workbook = load_workbook(file, data_only=True)
        try:
            self.assertEqual(workbook.active["A2"].value, 1859.16)
            self.assertEqual(workbook.active["A2"].number_format, fmt)
        finally:
            workbook.close()

    def test_invoice_vat_rounding_and_two_independent_mutations(self):
        unit = Decimal("10.23")
        rows = [[f"Voce {i}", i, float(unit), {"formula": f"=B{i+1}*C{i+1}", "expected": float(i*unit)}] for i in range(1, 13)]
        subtotal = sum(Decimal(i)*unit for i in range(1,13))
        def vat(value):
            return (value * Decimal("0.22")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        updated = subtotal + 2 * unit
        rows.extend([
            ["Imponibile", None, None, {"formula": "=SUM(D2:D13)", "expected": float(subtotal)}],
            ["IVA", None, None, {"formula": "=ROUND(D14*22/100,2)", "expected": float(vat(subtotal))}],
            ["Totale", None, None, {"formula": "=D14+D15", "expected": float(subtotal+vat(subtotal))}],
        ])
        spec = {"title":"Preventivo", "sheets":[
            {"name":"Preventivo","columns":["Voce","Qtà","Unitario","Importo"],"rows":rows,
             "inputCheck":{"cell":"B2","value":3,"expect":[{"cell":"D16","value":float(updated+vat(updated))}]}},
            {"name":"Scostamento","columns":["Input","Base","Calcolo"],"rows":[[5,40,{"formula":"=-A2+B2*20%","expected":3}]],
             "inputCheck":{"cell":"A2","value":7,"expect":[{"cell":"C2","value":1}]}},
        ]}
        run_sheets(spec,self.path,self.theme)
        wb = load_workbook(self.path/"workbook.xlsx",data_only=True)
        try:
            self.assertEqual(wb["Preventivo"]["D16"].value,float(subtotal+vat(subtotal)))
            self.assertEqual(wb["Scostamento"]["C2"].value,3)
        finally:
            wb.close()

    def test_wrong_expected_value_and_independent_input_are_rejected(self):
        for variant in ["wrong result","unrelated input"]:
            spec=sample()
            if variant=="wrong result":
                spec["sheets"][0]["rows"][0][3]["expected"]=29
            else:
                spec["sheets"][0]["inputCheck"]={"cell":"B3","value":4,"expect":[{"cell":"D2","value":38}]}
            with self.subTest(variant=variant),self.assertRaisesRegex(ValueError,"diverso dall'atteso"):
                run_sheets(spec,self.path,self.theme)
            self.assertFalse((self.path/"workbook.xlsx").exists())
