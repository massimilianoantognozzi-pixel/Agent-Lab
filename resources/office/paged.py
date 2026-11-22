"""Generate a paged Office document in the offline Debian Office worker."""

import math
import re
import shutil
import subprocess
import tempfile
import unicodedata
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree
from xml.sax.saxutils import escape

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor
from PIL import Image, ImageChops
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, LongTable, PageBreak,
                                PageTemplate, Paragraph, Spacer, TableStyle)


MARGIN = 46
BOTTOM = 53
TEXT = '233143'
MUTED = '4C5D6D'
FAMILY = 'DejaVu Sans'
REGULAR = 'OfficeDejaVu'
BOLD = 'OfficeDejaVuBold'
FONT_DIR = Path('/usr/share/fonts/truetype/dejavu')
PLACEHOLDER = re.compile(r'{{[^{}\n]{1,80}}}|\[(?:insert|inserire|placeholder)(?:\s+[^\]\n]*)?\]|\blorem ipsum\b', re.I)


def _strings(value):
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise ValueError('È richiesta una lista di testi.')
    return [s.replace('\r\n', '\n').replace('\r', '\n').replace('\t', '    ') for s in value]


def _spec(spec, theme):
    title, org, footer = _strings([spec['title'], theme.get('organization', ''), theme.get('footer', '')])
    columns = _strings(spec.get('columns', []))
    rows = [_strings(row) for row in spec.get('rows', [])]
    if not title.strip() or any(not c.strip() for c in columns) or any(len(row) != len(columns) or not columns for row in rows):
        raise ValueError('Titolo, intestazioni o numero di celle non validi.')
    breaks = spec.get('pageBreakBeforeRows', [])
    if not isinstance(breaks, list) or any(type(i) is not int or not 0 <= i < len(rows) for i in breaks):
        raise ValueError('Indice di interruzione pagina fuori dalla tabella.')
    accent = theme['accent']
    if not re.fullmatch(r'#[0-9a-fA-F]{6}', accent):
        raise ValueError('Colore del tema non valido.')
    logo = theme.get('logo')
    logo_size = None
    if logo:
        # generate.py supplies its privately normalized PNG, never a user-controlled path.
        logo = Path(logo)
        if not logo.is_absolute():
            raise ValueError('Percorso del logo non ammesso.')
        with Image.open(logo) as image:
            if image.format != 'PNG' or image.width * image.height > 8_000_000:
                raise ValueError('Formato o dimensioni del logo non validi.')
            scale = min(85 / image.width, 28 / image.height)
            logo_size = (image.width * scale, image.height * scale)
    return dict(title=title, org=org, footer=footer, paragraphs=_strings(spec.get('paragraphs', [])), summary=_strings(spec.get('summary', [])),
                columns=columns, rows=rows, breaks=set(breaks), accent=accent, logo=logo, logo_size=logo_size)


def _initialize_fonts(strings):
    if REGULAR not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(REGULAR, str(FONT_DIR / 'DejaVuSans.ttf')))
        pdfmetrics.registerFont(TTFont(BOLD, str(FONT_DIR / 'DejaVuSans-Bold.ttf')))
    available = pdfmetrics.getFont(REGULAR).face.charToGlyph
    for string in strings:
        if PLACEHOLDER.search(string):
            raise ValueError('Il contenuto comprende un segnaposto irrisolto.')
        if any((ord(char) < 32 and char != '\n') or (not char.isspace() and ord(char) not in available) for char in string):
            raise ValueError('Il testo contiene un carattere non riproducibile con il font disponibile.')


def _table_groups(data):
    if not data['columns']:
        return
    starts = sorted({0, *data['breaks']})
    for i, start in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else len(data['rows'])
        yield start in data['breaks'], [data['columns'], *data['rows'][start:end]]


def _column_widths(data, page):
    if not data['columns']:
        return []
    weights = []
    for index, heading in enumerate(data['columns']):
        sample = [len(cell) for row in data['rows'] for cell in row[index].splitlines()]
        sample.sort()
        typical = sample[(len(sample) - 1) * 3 // 4] if sample else 0
        weights.append(math.sqrt(max(8, min(54, max(typical, len(heading))))))
    available = page[0] - 2 * MARGIN
    return [available * w / sum(weights) for w in weights]


def _header_background(accent):
    # A pale version of the chosen accent keeps contrast with dark header text even for light brand colors.
    rgb = bytes.fromhex(accent[1:])
    return ''.join(f'{round(255 * 0.85 + c * 0.15):02X}' for c in rgb)


def _word(data, page, widths, dest):
    document = Document()
    document.core_properties.title = data['title']
    document.core_properties.author = data['org']
    document.core_properties.comments = ''
    section = document.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE if page[0] > page[1] else WD_ORIENT.PORTRAIT
    section.page_width, section.page_height = map(Pt, page)
    section.top_margin = section.left_margin = section.right_margin = Pt(MARGIN)
    section.bottom_margin = Pt(BOTTOM)
    section.footer_distance = Pt(24)
    if data['logo_size']:
        section.header_distance = Pt(19)
        section.top_margin = Pt(64)
        header = section.header.paragraphs[0]
        header.paragraph_format.space_after = Pt(0)
        width, height = data['logo_size']
        header.add_run().add_picture(str(data['logo']), width=Pt(width), height=Pt(height))
    normal = document.styles['Normal']
    normal.font.name, normal.font.size, normal.font.color.rgb = FAMILY, Pt(10.5), RGBColor.from_string(TEXT)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.2
    title = document.styles['Title']
    title.font.name, title.font.size, title.font.bold, title.font.color.rgb = FAMILY, Pt(24), True, RGBColor(0, 0, 0)
    font = title.element.get_or_add_rPr().rFonts
    for attribute in ('asciiTheme', 'hAnsiTheme', 'eastAsiaTheme', 'cstheme'):
        font.attrib.pop(qn('w:' + attribute), None)
    title.paragraph_format.space_after = Pt(10)
    title.paragraph_format.keep_with_next = False
    frame = title.element.find(qn('w:pPr'))
    border = frame.find(qn('w:pBdr')) if frame is not None else None
    if border is not None:
        frame.remove(border)
    if data['org']:
        run = document.add_paragraph().add_run(data['org'])
        run.bold, run.font.size = True, Pt(9)
    document.add_paragraph(data['title'], style='Title')
    for text in data['paragraphs']:
        document.add_paragraph(text)
    for page_break, group in _table_groups(data):
        if page_break:
            document.add_page_break()
        table = document.add_table(rows=0, cols=len(widths))
        table.autofit = False
        for column, width in zip(table.columns, widths):
            column.width = Pt(width)
        for index, values in enumerate(group):
            row = table.add_row()
            if index == 0:
                row._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))
            for cell, value, width in zip(row.cells, values, widths):
                cell.width = Pt(width)
                para = cell.paragraphs[0]
                para.paragraph_format.space_before = Pt(3)
                para.paragraph_format.space_after = Pt(4)
                run = para.add_run(value)
                run.bold = index == 0
                run.font.size = Pt(9)
                if index == 0 or index % 2 == 0:
                    shading = OxmlElement('w:shd')
                    shading.set(qn('w:fill'), _header_background(data['accent']) if index == 0 else 'F5F7F9')
                    cell._tc.get_or_add_tcPr().append(shading)
    for text in data['summary']:
        document.add_paragraph(text)
    if data['footer']:
        run = section.footer.paragraphs[0].add_run(data['footer'])
        run.font.name, run.font.size, run.font.color.rgb = FAMILY, Pt(8), RGBColor.from_string(MUTED)
    document.save(dest)
    reopened = Document(dest)
    if [p.text for p in reopened.paragraphs if p.text.strip()] != [v for v in (data['org'], data['title'], *data['paragraphs'], *data['summary']) if v.strip()]:
        raise ValueError('Il testo Word riaperto differisce dalla specifica.')
    expected = [group for _, group in _table_groups(data)]
    readback = [[[cell.text for cell in row.cells] for row in tab.rows] for tab in reopened.tables]
    if readback != expected:
        raise ValueError('Le tabelle Word riaperte differiscono dalla specifica.')


def _pdf(data, page, widths, dest):
    doc = BaseDocTemplate(str(dest), pagesize=page, title=data['title'], author=data['org'])
    top = 64 if data['logo_size'] else MARGIN
    frame = Frame(MARGIN, BOTTOM, page[0] - MARGIN * 2, page[1] - top - BOTTOM,
                  leftPadding=0, rightPadding=0, bottomPadding=0, topPadding=0)
    def style(name, size, leading, bold=False, **extra):
        return ParagraphStyle(name, fontName=BOLD if bold else REGULAR, fontSize=size, leading=leading, textColor=colors.HexColor('#' + TEXT),
                              splitLongWords=True, **extra)
    def para(text, fmt):
        # Keep all XML-looking source text literal; ReportLab paragraphs accept markup.
        return Paragraph(escape(text).replace('\n', '<br/>'), fmt)
    body = style('body', 10.5, 14, spaceAfter=6)
    title = style('title', 24, 30, True, spaceAfter=10)
    label = style('label', 9, 12, True, spaceAfter=6)
    cell = style('cell', 9, 12)
    header = style('header', 9, 12, True)
    footer = style('footer', 8, 10)
    def on_page(canvas, _document):
        if data['logo_size']:
            width, height = data['logo_size']
            canvas.drawImage(str(data['logo']), MARGIN, page[1] - 19 - height, width=width, height=height, mask='auto')
        if data['footer']:
            item = para(data['footer'], footer)
            _, h = item.wrap(page[0] - 2 * MARGIN, BOTTOM)
            if h > BOTTOM - 18:
                raise ValueError('Il piè di pagina supera lo spazio riservato.')
            item.drawOn(canvas, MARGIN, 21)
    doc.addPageTemplates(PageTemplate('body', [frame], onPage=on_page))
    story = []
    if data['org']:
        story.append(para(data['org'], label))
    story.append(para(data['title'], title))
    story.extend(para(text, body) for text in data['paragraphs'])
    for page_break, group in _table_groups(data):
        if page_break:
            story.append(PageBreak())
        cells = [[para(v, header if i == 0 else cell) for v in row] for i, row in enumerate(group)]
        table = LongTable(cells, colWidths=widths, repeatRows=1, splitByRow=1, splitInRow=1, hAlign='LEFT')
        table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#' + _header_background(data['accent']))),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F7F9')]),
            ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(table)
    if data['columns'] and data['summary']:
        story.append(Spacer(1, 8))
    story.extend(para(text, body) for text in data['summary'])
    doc.build(story)


def _exec(argv):
    try:
        subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True, timeout=90)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise ValueError(f'Operazione {Path(argv[0]).name} non completata.') from exc


def _compact(text):
    return ''.join(unicodedata.normalize('NFKC', text).split()).replace('\u00ad', '')


def _verify_pdf(pdf, texts, page, widths, headers, work):
    pdf_pages = PdfReader(pdf, strict=True).pages
    if not 1 <= len(pdf_pages) <= 100:
        raise ValueError('Il documento supera il limite di 100 pagine o è vuoto.')
    xml = work / 'layout.xml'
    _exec(['pdftotext', '-bbox', str(pdf), str(xml)])
    pages = ElementTree.parse(xml).findall('.//{*}page')
    if len(pages) != len(pdf_pages):
        raise ValueError('La riapertura del PDF ha prodotto conteggi di pagine diversi.')
    raw = work / 'body.txt'
    _exec(['pdftotext', '-raw', '-enc', 'UTF-8', str(pdf), str(raw)])
    projections = [[] for _ in widths]
    body_text = []
    total_text = []
    for number, rendered in enumerate(pages):
        words = rendered.findall('.//{*}word')
        if not words or abs(float(rendered.get('width')) - page[0]) > 1 or abs(float(rendered.get('height')) - page[1]) > 1:
            raise ValueError(f'Formato o contenuto della pagina {number + 1} non valido.')
        page_body = []
        page_columns = [[] for _ in widths]
        for word in words:
            x0, y0, x1, y1 = (float(word.get(k)) for k in ('xMin', 'yMin', 'xMax', 'yMax'))
            if not (MARGIN - 5 <= x0 <= x1 <= page[0] - MARGIN + 5 and 8 <= y0 <= y1 <= page[1] - 8):
                raise ValueError(f'Testo fuori dal margine sulla pagina {number + 1}.')
            total_text.append(word.text or '')
            if y0 > page[1] - BOTTOM + 2:
                continue
            page_body.append(word.text or '')
            left = MARGIN
            for index, width in enumerate(widths):
                if left <= (x0 + x1) / 2 <= left + width:
                    page_columns[index].append(word.text or '')
                    break
                left += width
        if not page_body:
            raise ValueError(f'La pagina {number + 1} contiene solo il piè di pagina.')
        body_text.extend(page_body)
        columns = [_compact(' '.join(words)) for words in page_columns]
        # A table continued on the next page starts with its repeated column labels.
        # Remove that repeated header in this projection only, so a single long cell
        # remains continuous for text verification even when it spans several pages.
        starts_with_header = number > 0 and all(column.startswith(_compact(header)) for column, header in zip(columns, headers))
        for index, column in enumerate(columns):
            projections[index].append(column[len(_compact(headers[index])):] if starts_with_header else column)
    all_words = _compact(' '.join(total_text))
    representations = [all_words, _compact(' '.join(body_text)), _compact(raw.read_text('utf8')), *(''.join(column) for column in projections)]
    expected = Counter(_compact(' '.join(texts)))
    if expected - Counter(all_words):
        raise ValueError('Il PDF non riproduce tutti i caratteri forniti.')
    # Short consecutive passages survive page breaks and interleaving of long table cells.
    tokens = Counter()
    for source in texts:
        for line in source.splitlines():
            words = line.split()
            tokens.update(_compact(word) for word in words)
            for i in range(0, len(words), 5):
                phrase = _compact(' '.join(words[i:i + 5]))
                if phrase and not any(phrase in representation for representation in representations):
                    raise ValueError('Un passaggio del testo non è leggibile nel PDF.')
    if any(count > 1 and all_words.count(token) < count for token, count in tokens.items()):
        raise ValueError('Il PDF omette una o più occorrenze del testo.')
    _exec(['pdftoppm', '-r', '100', '-png', str(pdf), str(work / 'raster')])
    pngs = sorted(work.glob('raster-*.png'), key=lambda p: int(p.stem.split('-')[-1]))
    if len(pngs) != len(pages):
        raise ValueError('Rasterizzazione PDF incompleta.')
    for png in pngs:
        with Image.open(png) as image:
            image.load()
            gray = image.convert('L')
            ink = ImageChops.invert(gray).getbbox()
            if not ink or min(ink[0], ink[1], image.width - ink[2], image.height - ink[3]) < 4:
                raise ValueError('Pagina vuota o contenuto a contatto con il bordo.')
    return pngs


def run_paged(spec, formats, outdir, theme):
    """Publish validated DOCX/PDF and page previews; leave intermediate files private."""
    selected = set(formats) & {'docx', 'pdf'}
    if not selected:
        raise ValueError('Nessun formato impaginato richiesto.')
    data = _spec(spec, theme)
    texts = [data['org'], data['title'], *data['paragraphs'], *data['columns'], *(v for row in data['rows'] for v in row), *data['summary'], data['footer']]
    _initialize_fonts(texts)
    page = landscape(A4) if len(data['columns']) > 5 else A4
    widths = _column_widths(data, page)
    checks = []
    with tempfile.TemporaryDirectory(prefix='office-paged-') as temp:
        work = Path(temp)
        docx = work / 'document.docx'
        pdf = work / 'document.pdf'
        if 'docx' in selected:
            _word(data, page, widths, docx)
            _exec(['soffice', '-env:UserInstallation=' + (work / 'profile').as_uri(), '--headless', '--nologo', '--nodefault',
                   '--norestore', '--convert-to', 'pdf:writer_pdf_Export', '--outdir', str(work), str(docx)])
            engine = 'python-docx + LibreOffice Writer'
            checks.append('DOCX riaperto con testo e celle confrontati con la specifica')
        else:
            _pdf(data, page, widths, pdf)
            engine = 'ReportLab'
        pngs = _verify_pdf(pdf, texts, page, widths, data['columns'], work)
        previews = [f'page-{i:03}.png' for i in range(1, len(pngs) + 1)]
        checks.extend(['PDF riaperto, testo e margini verificati', 'Tutte le pagine rasterizzate e verificate'])
        outputs = [(work / ('document.' + fmt), 'document.' + fmt) for fmt in sorted(selected)] + list(zip(pngs, previews))
        for source, name in outputs:
            if (outdir / name).exists():
                raise FileExistsError(name)
        for source, name in outputs:
            shutil.copyfile(source, outdir / name)
    return dict(checks=checks, previews=previews, pages=len(previews), engine=engine)
