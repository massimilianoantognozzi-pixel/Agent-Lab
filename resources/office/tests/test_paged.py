import sys
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from PIL import Image, ImageDraw
from pypdf import PdfReader

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paged


class PagedDocumentsTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.out = self.root / 'out'
        self.out.mkdir()
        self.theme = {'name': 'Officina', 'accent': '#FFD55B', 'organization': 'Officina civile', 'footer': 'Revisione interna'}
        self.spec = {
            'title': 'Riepilogo delle verifiche',
            'paragraphs': ['I controlli di qualità includono <ordini> & resi.\nLavoro già completato.'],
            'columns': ['Attività', 'Stato'],
            'rows': [['Primo turno', 'Acquisito\nConfermato'], ['Secondo turno', 'Concluso']],
            'pageBreakBeforeRows': [1], 'summary': ['Tutte le attività sono state registrate.']
        }

    def test_word_and_pdf_share_render_and_preserve_text_and_page_break(self):
        result = paged.run_paged(self.spec, ['docx', 'pdf', 'xlsx'], self.out, self.theme)
        self.assertIn('LibreOffice', result['engine'])
        self.assertEqual(result['pages'], 2)
        self.assertEqual(set(p.name for p in self.out.iterdir()), {'document.docx', 'document.pdf', 'page-001.png', 'page-002.png'})
        pages = PdfReader(self.out / 'document.pdf').pages
        self.assertIn('Primo turno', pages[0].extract_text())
        self.assertNotIn('Secondo turno', pages[0].extract_text())
        self.assertIn('Secondo turno', pages[1].extract_text())
        for preview in result['previews']:
            with Image.open(self.out / preview) as image:
                self.assertGreater(image.height, 1000)

    def test_only_word_emits_qa_previews_and_embeds_the_proportional_header_logo(self):
        logo = self.root / 'logo.png'
        image = Image.new('RGB', (180, 48), 'white')
        ImageDraw.Draw(image).rectangle((8, 7, 172, 41), fill='#173862')
        image.save(logo)
        result = paged.run_paged(self.spec, ['docx'], self.out, {**self.theme, 'logo': str(logo)})
        self.assertFalse((self.out / 'document.pdf').exists())
        self.assertEqual(result['pages'], 2)
        with ZipFile(self.out / 'document.docx') as archive:
            self.assertIn('word/header1.xml', archive.namelist())
            self.assertTrue(any(name.startswith('word/media/') for name in archive.namelist()))
        for name in result['previews']:
            with Image.open(self.out / name) as preview:
                self.assertLess(preview.convert('L').crop((56, 15, 200, 73)).getextrema()[0], 200)
        pdf_only = self.out / 'print'
        pdf_only.mkdir()
        direct = paged.run_paged(self.spec, ['pdf'], pdf_only, {**self.theme, 'logo': logo})
        for name in direct['previews']:
            with Image.open(pdf_only / name) as preview:
                self.assertLess(preview.convert('L').crop((56, 15, 200, 73)).getextrema()[0], 200)

    def test_reportlab_landscape_preserves_many_rows_repeated_values_and_last_line(self):
        self.spec.update(columns=['Reparto', 'Lotto', 'Data', 'Note', 'Uscita', 'Esito'], pageBreakBeforeRows=[],
                         rows=[[f'Turno {i}', 'A', 'Settembre', 'Campione da controllare\nDoppia verifica', 'Est', 'Aperto'] for i in range(55)])
        result = paged.run_paged(self.spec, ['pdf'], self.out, self.theme)
        self.assertEqual(result['engine'], 'ReportLab')
        self.assertGreaterEqual(result['pages'], 3)
        self.assertFalse((self.out / 'document.docx').exists())
        pages = PdfReader(self.out / 'document.pdf').pages
        self.assertGreater(pages[0].mediabox.width, pages[0].mediabox.height)
        self.assertIn('Turno 54', pages[-1].extract_text())

    def test_rejects_incomplete_cells_unknown_logo_paths_and_placeholders_before_publish(self):
        for spec, theme in [
            ({**self.spec, 'rows': [['solo una cella']]}, self.theme),
            ({**self.spec, 'summary': ['{{nomeCliente}}']}, self.theme),
            (self.spec, {**self.theme, 'logo': 'another.png'}),
        ]:
            with self.subTest(title=spec['title'], theme=theme):
                with self.assertRaises(ValueError):
                    paged.run_paged(spec, ['pdf'], self.out, theme)
                self.assertEqual(list(self.out.iterdir()), [])

    def test_a_single_long_cell_and_paragraph_can_continue_across_page_headers_and_footers(self):
        text = ' '.join(f'Blocco{i:04} pezzo' for i in range(680))
        spec = {'title': 'Specifica materiale', 'paragraphs': [text], 'columns': ['Codice', 'Descrizione'], 'rows': [['Lotto 4', text]]}
        for fmt in ('pdf', 'docx'):
            with self.subTest(fmt=fmt):
                dest = self.out / fmt
                dest.mkdir()
                result = paged.run_paged(spec, [fmt], dest, self.theme)
                self.assertGreater(result['pages'], 3)


if __name__ == '__main__':
    unittest.main()
