# -*- coding: utf-8 -*-
"""Extraccion validada de las tablas de soportes Translink (TL) -> JSON.

Uso: python -I extract_tl.py
Lee el PDF con pdfplumber (coordenadas), no usa el texto -layout salvo para
las descripciones de serie de las paginas resumen L9/L10.
"""
import json, re, os, sys
from collections import defaultdict, Counter
from fractions import Fraction
import pdfplumber

BASE = os.path.dirname(os.path.abspath(__file__))
# Ruta del PDF: primer argumento, o data/source/ del repo por defecto.
PDF = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data", "source", 'Soportes TL.pdf')
TXT = os.path.join(BASE, "Soportes TL.txt")
OUT = os.path.join(BASE, "out")
TABLE_PAGES = range(12, 47)  # paginas fisicas 12..46 (L11..L45)

# ---------------------------------------------------------------- utilidades
def num(s):
    """'31,0' -> 31.0 ; '9.0' -> 9.0 ; devuelve None si no es numero limpio."""
    s = s.strip().rstrip(',')
    if re.fullmatch(r"\d+([,.]\d+)?", s):
        return float(s.replace(',', '.'))
    return None

GOOD_DEN = {2, 4, 8, 16, 32, 64}
def inch(s):
    """'1 3/16' -> Fraction(19,16); None si no es una fraccion valida."""
    s = s.strip()
    m = re.fullmatch(r"(\d+)", s)
    if m:
        return Fraction(int(m.group(1)))
    m = re.fullmatch(r"(?:(\d+) )?(\d+)/(\d+)", s)
    if not m:
        return None
    w, a, b = int(m.group(1) or 0), int(m.group(2)), int(m.group(3))
    if b not in GOOD_DEN or a >= b or a == 0:
        return None
    if Fraction(a, b).denominator != b:  # 2/4 etc. -> no canonico
        return None
    return w + Fraction(a, b)

def fmt_inch(fr):
    w = fr.numerator // fr.denominator
    r = fr - w
    if r == 0:
        return f'{w}"'
    return (f"{w} " if w else "") + f'{r.numerator}/{r.denominator}"'

REF_RE = re.compile(r"^(?:TL-|T-|L-)?[A-Z]{2,7}-?X?-?\d{2,3}(?:-\.?\d{1,2})?$")
HOUS_RE = re.compile(r"^(?:TL-)?[A-Z]{1,7}-?X?-?\d{2,3}$")
def is_ref(t):
    return bool(REF_RE.match(t.replace(' ', '')))
def is_right_ref(t):
    t = t.replace(' ', '')
    return (bool(REF_RE.match(t)) or bool(HOUS_RE.match(t))) and not re.fullmatch(r"M\d+", t)

def norm_ref(t):
    """Normaliza erratas tipograficas: prefijo TL-/T-/L-, guiones entre letras y
    numeros, punto suelto. Devuelve (base_sin_sufijo, sufijo_pulgadas|None)."""
    t = t.replace(' ', '')
    t = re.sub(r"^(TL-|T-|L-)", "", t)
    m = re.fullmatch(r"([A-Z]+)-?(X?)-?(\d{2,3})(?:-\.?(\d{1,2}))?", t)
    if not m:
        return None, None
    base = m.group(1) + m.group(2) + m.group(3)
    return base, (int(m.group(4)) if m.group(4) else None)

def size_code(base):
    m = re.search(r"(X?\d{2,3})$", base)
    return m.group(1) if m else None

def bore_mm(code):
    """Diametro de eje por codigo de tamano: 00->10, 01->12, 02->15, 03->17, nn->nn*5."""
    m = re.search(r"(\d{2})$", code)
    nn = int(m.group(1))
    return {0: 10, 1: 12, 2: 15, 3: 17}.get(nn, nn * 5)

def family(code):
    if code.startswith('X'):
        return 'X'
    return code[0] if len(code) == 3 else '0'

BOLT_INCH_OK = {"1/4", "5/16", "3/8", "7/16", "1/2", "5/8", "3/4", "7/8", "1", "1 1/8", "1 1/4", "1 3/8", "1 1/2", "1 5/8", "1 3/4"}

# ------------------------------------------------------- descripciones en ES
DESC_ES = {
    "UCP200": "Soporte de pie de fundición, serie normal (pillow block)",
    "UCPX00": "Soporte de pie de fundición, serie media (pillow block)",
    "UCP300": "Soporte de pie de fundición, serie pesada (pillow block)",
    "UCPH200": "Soporte de pie alto (pedestal) de fundición, serie normal",
    "UCPA200": "Soporte de pie de fundición con base roscada (tapped base), serie normal",
    "SAPP200": "Soporte de pie de chapa de acero estampada cincada, serie ligera, inserto con collar excéntrico (SA)",
    "SBPP200": "Soporte de pie de chapa de acero estampada cincada, serie ligera, inserto con prisioneros (SB)",
    "UCF200": "Soporte de brida cuadrada de fundición (4 agujeros), serie normal",
    "UCFX00": "Soporte de brida cuadrada de fundición (4 agujeros), serie media",
    "UCF300": "Soporte de brida cuadrada de fundición (4 agujeros), serie pesada",
    "UCFL200": "Soporte de brida oval de fundición (2 agujeros), serie normal",
    "UCFLX00": "Soporte de brida oval de fundición (2 agujeros), serie media",
    "UCFL300": "Soporte de brida oval de fundición (2 agujeros), serie pesada",
    "UCFC200": "Soporte de brida redonda con centraje (cartucho) de fundición, serie normal",
    "UCFA200": "Soporte de brida de fundición con soporte ajustable (adjustable bracket), serie normal",
    "UCFB200": "Soporte de brida de fundición tipo escuadra (bracket), serie normal",
    "SAPFL200": "Soporte de brida oval de chapa estampada, serie ligera, inserto con collar excéntrico (SA)",
    "SBPFL200": "Soporte de brida oval de chapa estampada, serie ligera, inserto con prisioneros (SB)",
    "SAPF200": "Soporte de brida redonda (cartucho) de chapa estampada, serie ligera, inserto con collar excéntrico (SA)",
    "SBPF200": "Soporte de brida redonda (cartucho) de chapa estampada, serie ligera, inserto con prisioneros (SB)",
    "SAPFT200": "Soporte de brida triangular de chapa estampada, serie ligera, inserto con collar excéntrico (SA)",
    "SBPFT200": "Soporte de brida triangular de chapa estampada, serie ligera, inserto con prisioneros (SB)",
    "UCST200": "Soporte tensor (take-up) de fundición, ranura ancha en pulgadas, serie normal",
    "UCT200": "Soporte tensor (take-up) de fundición, ranura estrecha métrica, serie normal",
    "UCT300": "Soporte tensor (take-up) de fundición, serie pesada",
    "UCC200": "Soporte cilíndrico (cartucho) de fundición, serie normal",
    "UCHA200": "Soporte colgante (hanger) de fundición para transportadores de sinfín, serie normal",
    "PPL200": "Soporte de pie termoplástico (PBT), serie ligera",
    "TBPL200": "Soporte de pie termoplástico (PBT) con base roscada, serie ligera",
    "FPL200": "Soporte de brida cuadrada termoplástico (PBT), serie ligera",
    "FCPL200": "Soporte de brida redonda (cartucho) termoplástico (PBT), serie ligera",
    "FBPL200": "Soporte de brida tipo escuadra (bracket) termoplástico (PBT), serie ligera",
    "NFL200": "Soporte de brida oval termoplástico (PBT), serie ligera",
    "TMPL200": "Soporte de brida triangular termoplástico (PBT), serie ligera",
    "TPL200": "Soporte tensor (take-up) termoplástico (PBT), serie ligera",
    "HAPL200": "Soporte colgante (hanger) termoplástico (PBT), serie ligera",
    "SSP000": "Soporte de pie de acero inoxidable, miniatura (eje 10-30 mm), serie ligera",
    "SSP200": "Soporte de pie de acero inoxidable",
    "SSPH200": "Soporte de pie alto (pedestal) de acero inoxidable",
    "SSPA200": "Soporte de pie de acero inoxidable con base roscada",
    "SSPW200": "Soporte de pie de acero inoxidable (serie SSPW)",
    "SSPG200": "Soporte de pie de acero inoxidable con base roscada (serie SSPG)",
    "SSTB200": "Soporte de pie de acero inoxidable con base roscada (serie SSTB)",
    "SSF200": "Soporte de brida cuadrada de acero inoxidable",
    "SSFS200": "Soporte de brida cuadrada de acero inoxidable (serie SSFS)",
    "SSFL000": "Soporte de brida de acero inoxidable, miniatura (eje 10-30 mm), serie ligera",
    "SSFL200": "Soporte de brida oval de acero inoxidable",
    "SSFX200": "Soporte de brida oval de acero inoxidable (serie SSFX)",
    "SSFA200": "Soporte de brida de acero inoxidable con soporte ajustable (adjustable bracket)",
    "SSFB200": "Soporte de brida de acero inoxidable tipo escuadra (bracket)",
    "SSK000": "Rodamiento inserto miniatura de acero inoxidable con prisioneros (sin soporte)",
    "SSU000": "Rodamiento inserto miniatura de acero inoxidable con collar excéntrico (sin soporte)",
}
# En las series termoplasticas la columna BEARING REFERENCE da la unidad de fundicion equivalente.
THERMO_BEARING_PREFIX = {"PPL": "UCP", "TBPL": "UCPA", "FPL": "UCF", "FCPL": "UCFC", "FBPL": "UCFB",
                         "NFL": "UCFL", "TMPL": "UCFC", "TPL": "UCT", "HAPL": "UCECH"}
INSERT_PREFIXES = ("UC", "SA", "SB")
# Cuerpo compartido documentado por el propio PDF (alojamiento comun 201-204).
SHARED_HOUSING_OK = {("T", "201"): "204", ("T", "202"): "204", ("T", "203"): "204"}
# Columna 'k' en UCHA200 = rosca de engrase (G 3/4, G 1...); la 'c' esta en blanco en el PDF para 201-207.
ALLOWED_BLANK = {("UCHA200", "c")}
# Cabecera de UCT200 dice 'inch' pero los valores (12..85) son mm: refs metricas sin sufijo.
SHAFT_HEADER_OVERRIDE = {"UCT200": "mm"}

# -------------------------------------------------- resumen L9/L10 (texto)
def series_summaries():
    txt = open(TXT, encoding="utf-8", errors="replace").read().split(chr(10))
    block = []
    for ln in txt[480:620]:
        if "\x0c" in ln and "SERIES" in ln:   # empieza la primera pagina de tablas (L11)
            break
        block.append(ln)
    out, cur = {}, None
    for ln in block:
        s = ln.strip()
        if "Series" in s and ("block" in s or "bearings" in s or "units" in s):
            cur = re.sub(r"^\W+", "", s)
            m = re.search(r"Series\s+([A-Z]+\s?\d{2,3})", cur)
            key = m.group(1).replace(' ', '') if m else None
            out[key] = cur
            last = key
        elif cur and s and not s.startswith(("BEARING", "L9", "L10")) and re.match(r"^[a-zA-Z0-9]", s) and len(s) > 3:
            out[last] = out[last] + " " + s
    for k in out:
        out[k] = re.sub(r"\s+", " ", out[k]).strip()
    return out

# ------------------------------------------------------------- lectura PDF
def page_rows(page):
    ws = page.extract_words(x_tolerance=1.0)
    ws.sort(key=lambda w: (w['top'], w['x0']))
    rows = []
    for w in ws:
        if rows and abs(w['top'] - rows[-1]['top']) < 2.0:
            rows[-1]['w'].append(w)
        else:
            rows.append({'top': w['top'], 'w': [w]})
    for r in rows:
        r['w'].sort(key=lambda w: w['x0'])
        r['text'] = " ".join(w['text'] for w in r['w'])
    return rows

def joinable(a, b):
    """Solo se unen piezas de una misma celda: '1'+'1/8', 'M3'+'x'+'0,35', 'G'+'3/4', 'TL-SB'+'201', '1/'+'8'."""
    if is_ref(a) or is_ref(b):
        return False
    if re.fullmatch(r"\d+", a) and re.fullmatch(r"\d+/\d*", b):
        return True
    if a.endswith('/') and re.fullmatch(r"\d+", b):
        return True
    if b == 'x' or a.endswith('x') or a in ('G',) or (re.fullmatch(r"[A-Z]+(-[A-Z]+)?", a) and re.fullmatch(r"\d{3}", b)):
        return True
    if a == 'G' or (a.startswith('G ') and re.fullmatch(r"\d+/\d+", b)):
        return True
    return False

def cells(words, gap=5.0):
    """Une palabras contiguas (separacion < gap) en una celda (nunca pega una referencia)."""
    out = []
    for w in words:
        if out and w['x0'] - out[-1]['x1'] < gap and joinable(out[-1]['text'], w['text']):
            c = out[-1]
            c['text'] += " " + w['text']
            c['x1'] = w['x1']
        else:
            out.append({'text': w['text'], 'x0': w['x0'], 'x1': w['x1']})
    for c in out:
        c['cx'] = (c['x0'] + c['x1']) / 2
        c['text'] = re.sub(r"/\s+", "/", c['text'])
    return out

def page_code(rows):
    for r in rows:
        if r['top'] > 800:
            m = re.search(r"\bL(\d+)\b", r['text'])
            if m:
                return "L" + m.group(1)
    return None

def find_tables(rows):
    """Devuelve lista de dicts con titulo, subtitulo, banda de cabecera, fila de letras y cuerpo."""
    tabs = []
    for r in rows:
        r['text'] = re.sub(r"(SERIES [A-Z]+) ([A-Z]*\d+\*?)$", r"\1\2", r['text'])
    for i, r in enumerate(rows):
        if re.search(r"\b(SERIES|INSERTS)\s+[A-Z]{2,}\S*$", r['text']) and r['text'].isupper():
            tabs.append({'ti': i})
    for k, t in enumerate(tabs):
        end = tabs[k + 1]['ti'] if k + 1 < len(tabs) else len(rows)
        i = t['ti']
        t['title'] = rows[i]['text']
        t['series'] = re.search(r"(?:SERIES|INSERTS)\s+(\S+)", rows[i]['text']).group(1).rstrip('*')
        t['subtitle'] = rows[i + 1]['text'] if i + 1 < end else ""
        # fila de letras = primera fila que acaba en 'Kg'
        hi = None
        for j in range(i + 1, end):
            if rows[j]['w'][-1]['text'] == 'Kg':
                hi = j
                break
        t['hi'] = hi
        t['band'] = [w for j in range(i + 2, hi) for w in rows[j]['w']]
        sub = rows[hi + 1] if hi + 1 < end and rows[hi + 1]['top'] - rows[hi]['top'] < 6 else None
        t['sub'] = sub
        body = []
        start = hi + (2 if sub else 1)
        last_top = rows[hi]['top']
        for j in range(start, end):
            r = rows[j]
            if r['top'] - last_top > 19.5 or r['top'] > 800:
                break
            body.append(r)
            last_top = r['top']
        t['body'] = body
    return tabs

def header_columns(t):
    hdr = [dict(w) for w in t['tab_rows'][t['hi']]['w'] if w['text'] not in ("Dynamic", "Static")]
    # unir palabras pegadas ("f" + "min")
    merged = []
    for w in hdr:
        if merged and w['x0'] < merged[-1]['x1'] + 2.0 and w['text'].isalpha() and merged[-1]['text'].isalpha():
            merged[-1]['text'] += w['text']
            merged[-1]['x1'] = w['x1']
        else:
            merged.append({'text': w['text'], 'x0': w['x0'], 'x1': w['x1']})
    hdr = [h for h in merged if h['text'] not in ("Dynamic", "Static")]
    if t['sub']:
        for s in t['sub']['w']:
            cands = [h for h in hdr if h['x0'] - 1 <= s['x0'] <= h['x1'] + 7]
            if cands:
                h = min(cands, key=lambda h: s['x0'] - h['x1'])
                h['text'] += s['text']
    for h in hdr:
        h['cx'] = (h['x0'] + h['x1']) / 2
        h['name'] = h['text']
    names = [h['name'] for h in hdr]
    # roles
    roles = ['dim'] * len(hdr)
    roles[-1] = 'kg'
    i = 0
    while i < len(hdr) and hdr[i]['name'] in ('inch', 'mm', 'd'):
        roles[i] = {'inch': 'sh_inch', 'mm': 'sh_mm', 'd': 'sh_mm'}[hdr[i]['name']]
        i += 1
    j = len(hdr) - 2
    while j >= i and hdr[j]['name'] in ('Cr', 'C0r', 'Cor', 'mm', 'inch', 'Bolt'):
        nm = hdr[j]['name']
        if nm in ('Cr', 'C0r', 'Cor'):
            roles[j] = 'load'
            hdr[j]['name'] = 'Cr' if nm == 'Cr' else 'C0r'
        else:
            roles[j] = {'mm': 'bolt_mm', 'inch': 'bolt_inch', 'Bolt': 'bolt_mm'}[nm]
        j -= 1
    ov = SHAFT_HEADER_OVERRIDE.get(t['series'])
    if ov:
        roles = ['sh_mm' if r == 'sh_inch' else r for r in roles]
    for h, r in zip(hdr, roles):
        h['role'] = r
    return hdr

def band_positions(t):
    pos = {}
    ws = t['band']
    for k, w in enumerate(ws):
        if w['text'] == 'BEARING':
            nxt = ws[k + 1]['text'] if k + 1 < len(ws) else ''
            key = 'unit' if nxt == 'UNIT' else 'bearing'
            pos.setdefault(key, (w['x0'] + w['x1']) / 2)
        if w['text'] == 'HOUSING':
            pos.setdefault('housing', (w['x0'] + w['x1']) / 2)
    return pos

# ------------------------------------------------------------- tabla -> filas
def parse_table(t, page_no, pcode, report):
    hdr = header_columns(t)
    pos = band_positions(t)
    series = t['series']
    shaft_cols = [h for h in hdr if h['role'].startswith('sh_')]
    data_cols = [h for h in hdr if not h['role'].startswith('sh_')]
    first_data_x = data_cols[0]['cx']
    sh_mm = next((h for h in hdr if h['role'] == 'sh_mm'), None)
    left_kind = 'unit' if 'unit' in pos else 'housing'
    dim_letters = [h['name'] for h in hdr if h['role'] == 'dim']

    def col_for(c):
        best = min(data_cols, key=lambda h: abs(h['cx'] - c['cx']))
        # tolerancia: mitad de la distancia al vecino + 4
        k = data_cols.index(best)
        nb = [abs(data_cols[m]['cx'] - best['cx']) for m in (k - 1, k + 1) if 0 <= m < len(data_cols)]
        tol = (min(nb) / 2 + 4) if nb else 15
        return best if abs(best['cx'] - c['cx']) <= tol else None

    recs = []  # un registro por fila del cuerpo
    for r in t['body']:
        cs = cells(r['w'])
        rec = {'top': r['top'], 'left_refs': [], 'right_refs': [], 'shaft': [], 'data': defaultdict(list), 'junk': []}
        for c in cs:
            txt = c['text']
            if is_ref(txt) and (c['cx'] < (shaft_cols[0]['x0'] if shaft_cols else first_data_x) or left_kind == 'housing' and c['cx'] < first_data_x and not re.match(r"^[\d /-]+$", txt)):
                if c['cx'] < (sh_mm['x0'] if sh_mm else first_data_x) - 3:
                    rec['left_refs'].append(c)
                    continue
            if c['cx'] >= first_data_x - 12 and is_right_ref(txt):
                rec['right_refs'].append(c)
                continue
            if c['cx'] < first_data_x - 8:
                rec['shaft'].append(c)
                continue
            col = col_for(c)
            if re.fullmatch(r"M\d+", txt) and not any(h['role'] == 'bolt_mm' for h in hdr) and (col is None or col['name'] != 's'):
                rec['data']['BOLT#99'].append(txt)
                continue
            if col is None:
                rec['junk'].append(txt)
            else:
                rec['data'][col['name'] + '#' + str(hdr.index(col))].append(txt)
        recs.append(rec)

    # asignar refs de la izquierda: unidad/cuerpo y rodamientos
    left_slots = []
    if left_kind == 'unit':
        left_slots = ['unit']
    else:
        left_slots = ['housing']
    bpos = [(k, v) for k, v in pos.items()]

    def classify_right(c):
        cands = [(k, v) for k, v in pos.items() if k in ('bearing', 'housing')]
        if not cands:
            return None
        return min(cands, key=lambda kv: abs(kv[1] - c['cx']))[0]

    for rec in recs:
        rec['unit'] = None
        rec['housing_l'] = None
        rec['bearings'] = []
        rec['housing_r'] = []
        lr = sorted(rec['left_refs'], key=lambda c: c['x0'])
        if lr:
            rec['main'] = lr[0]['text']
            rec['bearings'] += [c['text'] for c in lr[1:]]
        else:
            rec['main'] = None
        for c in rec['right_refs']:
            k = classify_right(c)
            if k == 'bearing':
                rec['bearings'].append(c['text'])
            elif k == 'housing':
                rec['housing_r'].append(c['text'])
            else:
                rec['junk'].append(c['text'])

    # agrupacion por tamano
    groups = {}
    order = []
    for rec in recs:
        if rec['main']:
            b, suf = norm_ref(rec['main'])
            if b is None:
                report.append(dict(serie=series, pagina=pcode, ref=rec['main'], motivo="referencia ilegible"))
                rec['main'] = None
                continue
            rec['base'], rec['suf'] = b, suf
            if b not in groups:
                groups[b] = {'refs': [], 'rows': []}
                order.append(b)
            groups[b]['refs'].append(rec)
    # filas sin ref -> grupo cuyo rango vertical las contiene
    for rec in recs:
        if rec['main']:
            continue
        has = rec['data'] or rec['shaft'] or rec['housing_r'] or rec['bearings']
        if not has:
            continue
        tgt, bestd = None, 99
        for b in order:
            tops = [x['top'] for x in groups[b]['refs']]
            if min(tops) - 1 <= rec['top'] <= max(tops) + 1:
                tgt, bestd = b, -1
                break
            d = min(abs(rec['top'] - min(tops)), abs(rec['top'] - max(tops)))
            if d <= 7 and d < bestd:
                tgt, bestd = b, d
        if tgt is None:
            report.append(dict(serie=series, pagina=pcode, ref=None, motivo=f"fila de datos sin referencia asignable (y={rec['top']:.0f}): {' '.join(sum(rec['data'].values(), []))[:80]}"))
            continue
        groups[tgt]['rows'].append(rec)

    out_groups = []
    for b in order:
        g = groups[b]
        allrecs = g['refs'] + g['rows']
        # valores por columna a nivel grupo
        colvals = defaultdict(list)
        for rec in allrecs:
            for k, v in rec['data'].items():
                colvals[k] += v
        # mm del eje: tokens numericos en zona de eje alineados con la cabecera mm
        mm_vals, junk = [], []
        for rec in allrecs:
            for c in rec['shaft']:
                if sh_mm and abs(c['cx'] - sh_mm['cx']) <= 9 and num(c['text']) is not None and rec is not None:
                    mm_vals.append(num(c['text']))
                    c['used'] = True
        housing_vals = [h for rec in allrecs for h in rec['housing_r']]
        if left_kind == 'housing':
            housing_vals = [rec['main'] for rec in g['refs']]
        junk = [j for rec in allrecs for j in rec['junk']]
        out_groups.append(dict(base=b, refs=g['refs'], colvals=colvals, mm=mm_vals, housing=housing_vals, junk=junk))

    return dict(series=series, title=t['title'], subtitle=t['subtitle'], page=pcode, page_no=page_no,
                hdr=hdr, dim_letters=dim_letters, left_kind=left_kind, groups=out_groups, sh_mm=sh_mm)

# ------------------------------------------------------- construir registros
def build_rows(tab, report, summaries):
    series, pcode = tab['series'], tab['page']
    hdr = tab['hdr']
    dim_cols = [(h['name'], h['name'] + '#' + str(i)) for i, h in enumerate(hdr) if h['role'] == 'dim']
    bolt_mm_key = next((h['name'] + '#' + str(i) for i, h in enumerate(hdr) if h['role'] == 'bolt_mm'), 'BOLT#99')
    bolt_in_key = next((h['name'] + '#' + str(i) for i, h in enumerate(hdr) if h['role'] == 'bolt_inch'), None)
    load_keys = [(h['name'], h['name'] + '#' + str(i)) for i, h in enumerate(hdr) if h['role'] == 'load']
    kg_key = next(h['name'] + '#' + str(i) for i, h in enumerate(hdr) if h['role'] == 'kg')
    inch_only = series == 'UCST200'
    thermo = any(series.startswith(p) for p in THERMO_BEARING_PREFIX) and series not in ('SSP000',)
    stainless = series.startswith('SS')
    insert_table = series in ('SSK000', 'SSU000')
    desc_pdf = (tab['title'] + ". " + tab['subtitle']).strip()
    summ = summaries.get(series) or summaries.get(series.replace('SERIES', ''))

    def bad(ref, motivo):
        report.append(dict(serie=series, pagina=pcode, ref=ref, motivo=motivo))

    built = []
    for g in tab['groups']:
        cv = g['colvals']
        refs_txt = [r['main'] for r in g['refs']]
        gid = g['base']
        # --- valores de grupo: cada columna exactamente un valor
        problems = []
        for k, v in cv.items():
            if len(set(v)) > 1:
                problems.append(f"columna {k.split('#')[0]} con varios valores {v}")
        if g['junk']:
            problems.append(f"texto fuera de columna {g['junk']}")
        mmset = set(g['mm'])
        if len(mmset) > 1:
            problems.append(f"varios diametros mm {g['mm']}")
        if problems:
            for r in refs_txt:
                bad(r, "grupo ambiguo: " + "; ".join(problems))
            continue
        val = {k: v[0] for k, v in cv.items()}
        # medidas
        medidas, medidas_pulg, miss, nonnum = {}, {}, [], []
        for name, key in dim_cols:
            raw = val.get(key)
            if raw is None:
                if (series, name) in ALLOWED_BLANK:
                    medidas[name] = None
                    continue
                miss.append(name)
                continue
            if inch_only and name not in ('B1', 'n'):
                fr = inch(raw)
                if fr is None:
                    nonnum.append(f"{name}='{raw}'")
                    continue
                medidas_pulg[name] = raw
                medidas[name] = round(float(fr) * 25.4, 1)
                continue
            if inch_only:  # B1, n en pulgadas decimales
                x = num(raw)
                if x is None:
                    nonnum.append(f"{name}='{raw}'"); continue
                medidas_pulg[name] = raw
                medidas[name] = round(x * 25.4, 1)
                continue
            x = num(raw)
            if x is not None:
                medidas[name] = x
            elif re.fullmatch(r"M\d+(?: x \d+([,.]\d+)?)?", raw) or re.fullmatch(r"G (?:\d+ )?\d+(?:/\d+)?", raw) \
                    or re.fullmatch(r"\d+([,.]\d+)? x \d+([,.]\d+)?", raw) or (name == 's' and inch(raw) is not None):
                medidas[name] = raw  # designacion de rosca / tornillo
            else:
                nonnum.append(f"{name}='{raw}'")
        # celdas que sobran (en columnas no previstas) ya se detectan arriba; contar
        n_expected = len(dim_cols)
        n_found = len([1 for name, key in dim_cols if val.get(key) is not None])
        if miss or nonnum:
            for r in refs_txt:
                bad(r, f"medidas incompletas/no numericas (cabecera {n_expected} letras, {n_found} valores): faltan {miss} {nonnum}")
            continue
        # perno
        perno = val.get(bolt_mm_key) if bolt_mm_key else None
        perno_in = val.get(bolt_in_key) if bolt_in_key else None
        if perno is not None and not re.fullmatch(r"M\d+", perno):
            for r in refs_txt:
                bad(r, f"perno ilegible '{perno}'")
            continue
        perno_pulg = None
        if perno_in is not None:
            if perno_in in BOLT_INCH_OK:
                perno_pulg = perno_in + '"'
            else:
                g.setdefault('avisos', []).append(f"perno en pulgadas impreso '{perno_in}' no valido; omitido")
        if perno is None:
            s = medidas.get('s')
            if isinstance(s, str) and (s.startswith('M') or inch(s) is not None):
                if s.startswith('M'):
                    perno = s
                else:
                    perno_pulg = s + '"'
        # peso
        kgraw = val.get(kg_key)
        peso = num(kgraw) if kgraw else None
        if kgraw and peso is None:
            for r in refs_txt:
                bad(r, f"peso ilegible '{kgraw}'")
            continue
        if peso is not None and not (0.005 <= peso <= 200):
            for r in refs_txt:
                bad(r, f"peso no plausible {peso}")
            continue
        loads = {}
        for name, key in load_keys:
            if val.get(key):
                x = num(val[key])
                if x is None:
                    g.setdefault('avisos', []).append(f"capacidad {name} ilegible")
                else:
                    loads[name] = x
        # cuerpo
        hs = set(norm_ref(h)[0] for h in g['housing'] if norm_ref(h)[0])
        if len(hs) > 1:
            for r in refs_txt:
                bad(r, f"varios cuerpos {g['housing']}")
            continue
        cuerpo = hs.pop() if hs else None
        cuerpo_print = g['housing'][0] if g['housing'] else None
        code = size_code(gid)
        if code is None:
            for r in refs_txt:
                bad(r, "sin codigo de tamano")
            continue
        bore = bore_mm(code)
        # mm del eje
        mm = g['mm'][0] if g['mm'] else None
        if mm is not None and abs(mm - bore) > 0.01:
            for r in refs_txt:
                bad(r, f"eje mm impreso {mm} no coincide con el codigo {code} (={bore} mm)")
            continue
        grp_ok = dict(code=code, bore=bore, medidas=medidas, medidas_pulg=medidas_pulg, perno=perno,
                      perno_pulg=perno_pulg, peso=peso, loads=loads, cuerpo=cuerpo, cuerpo_print=cuerpo_print,
                      mm=mm, avisos=list(g.get('avisos', [])))
        # ---------------- filas (refs) del grupo
        seen = {}
        for rec in g['refs']:
            ref = rec['main']
            base, suf = rec['base'], rec['suf']
            avisos = list(grp_ok['avisos'])
            # pulgadas impresas en la fila
            sh_txt = " ".join(c['text'] for c in rec['shaft'] if not c.get('used'))
            sh_txt = sh_txt.strip()
            eje_pulg, eje_pulg_lista, eje_mm = None, None, None
            if tab['left_kind'] == 'unit' and not insert_table:
                if suf is not None:
                    want = Fraction(suf, 16)
                    if inch_only and not sh_txt:
                        pass
                    if not sh_txt:
                        bad(ref, f"no trae el eje en pulgadas impreso (sufijo -{suf} = {fmt_inch(want)})")
                        continue
                    fr = inch(sh_txt)
                    if fr is None or fr != want:
                        bad(ref, f"eje en pulgadas impreso '{sh_txt}' no coincide con el sufijo -{suf} (= {fmt_inch(want)})")
                        continue
                    mmv = float(fr) * 25.4
                    if not (bore - 5.6 <= mmv <= bore + 2.5):
                        bad(ref, f"eje {fmt_inch(fr)} ({mmv:.1f} mm) incompatible con el tamano {code} ({bore} mm)")
                        continue
                    eje_pulg = fmt_inch(fr)
                    eje_mm = round(mmv, 2)
                else:
                    if sh_txt:
                        bad(ref, f"referencia metrica con valor en pulgadas impreso en su fila ('{sh_txt}'); fila desalineada")
                        continue
                    if mm is None:
                        bad(ref, "referencia metrica sin diametro mm impreso en su grupo")
                        continue
                    eje_mm = mm
            else:
                # tablas con una fila por tamano: mm obligatorio + lista opcional de pulgadas compatibles
                if mm is None:
                    bad(ref, "sin diametro mm")
                    continue
                eje_mm = mm
                if sh_txt:
                    items = [s.strip() for s in re.sub(r"-", " - ", sh_txt).split(" - ")]
                    items = [re.sub(r"\s+", " ", s) for s in items if s.strip()]
                    frs = [inch(s) for s in items]
                    okl = all(f is not None and bore - 5.6 <= float(f) * 25.4 <= bore + 2.5 for f in frs)
                    if okl:
                        eje_pulg_lista = [fmt_inch(f) for f in frs]
                    else:
                        avisos.append(f"lista de ejes en pulgadas impresa '{sh_txt}' con erratas o incompatible con {bore} mm; omitida")
            # rodamiento
            rodamiento, rod_print = None, None
            brs = rec['bearings']
            if tab['left_kind'] == 'unit':
                if len(brs) != 1:
                    bad(ref, f"rodamiento no localizado de forma unica {brs}")
                    continue
                rod_print = brs[0]
                bb, bsuf = norm_ref(rod_print)
                if bb is None:
                    bad(ref, f"rodamiento ilegible '{rod_print}'")
                    continue
                if bsuf != suf:
                    bad(ref, f"sufijo del rodamiento '{rod_print}' distinto del de la unidad")
                    continue
                if bb == base:
                    # errata sistematica del PDF: imprime la unidad en la columna del rodamiento
                    avisos.append(f"el PDF imprime '{rod_print}' (la propia unidad) en la columna BEARING REFERENCE; rodamiento omitido")
                    rodamiento = None
                else:
                    okb = False
                    for k in range(2, len(bb)):
                        I, N = bb[:k], bb[k:]
                        if I in INSERT_PREFIXES and cuerpo and cuerpo.endswith(N) and base == I + cuerpo:
                            okb = True
                    # cuerpo compartido documentado
                    if not okb and cuerpo:
                        I = next((p for p in INSERT_PREFIXES if bb.startswith(p)), None)
                        if I and base == bb[:len(I)] + re.sub(r"\d+$", "", cuerpo) + code:
                            hl = re.sub(r"\d+$", "", cuerpo)
                            if SHARED_HOUSING_OK.get((hl, code)) == size_code(cuerpo) and bb == I + code:
                                okb = True
                                avisos.append(f"cuerpo {cuerpo} compartido (impreso asi en el PDF para {base})")
                    if not okb:
                        bad(ref, f"incoherencia unidad/rodamiento/cuerpo: unidad {base}, rodamiento '{rod_print}', cuerpo '{cuerpo_print}'")
                        continue
                    rodamiento = bb + (f"-{bsuf}" if bsuf else "")
                if cuerpo is None:
                    bad(ref, "sin cuerpo (housing) impreso")
                    continue
            else:
                # tablas por cuerpo (termoplastico / inoxidable)
                hl = re.sub(r"X?\d+$", "", base)
                if thermo:
                    if len(brs) != 1:
                        bad(ref, f"rodamiento no localizado de forma unica {brs}")
                        continue
                    rod_print = brs[0]
                    bb, bsuf = norm_ref(rod_print)
                    exp = THERMO_BEARING_PREFIX[hl] + code
                    if bb != exp or bsuf:
                        bad(ref, f"rodamiento '{rod_print}' incoherente (se esperaba {exp})")
                        continue
                    rodamiento = bb
                    avisos.append(f"en las series termoplasticas el PDF indica en BEARING REFERENCE la unidad de fundicion equivalente ({bb}), no el inserto")
                elif insert_table:
                    rodamiento = base
                    if base[:3] != series[:3]:
                        bad(ref, f"referencia '{ref}' no pertenece a la serie {series}")
                        continue
                elif brs:
                    oks = []
                    for b in brs:
                        bb, bsuf = norm_ref(b)
                        if bb is None or size_code(bb) != code or bsuf:
                            break
                        oks.append(bb)
                    if len(oks) != len(brs):
                        bad(ref, f"rodamientos incoherentes {brs}")
                        continue
                    rodamiento = " / ".join(oks)
                cuerpo = None if insert_table else base
            key = (base, suf)
            if key in seen:
                if seen[key] == (rodamiento, eje_pulg):
                    report.append(dict(serie=series, pagina=pcode, ref=ref, motivo="duplicado identico en el PDF (se conserva una sola fila)", tipo="info"))
                    continue
                bad(ref, "referencia duplicada con datos distintos")
                continue
            seen[key] = (rodamiento, eje_pulg)
            row = {
                "ref": ref,
                "ref_base": base + (f"-{suf}" if suf else ""),
                "serie": series,
                "descripcion": DESC_ES.get(series),
                "descripcion_pdf": desc_pdf + ((" | " + summ) if summ else ""),
                "eje_mm": eje_mm,
                "eje_pulg": eje_pulg,
                "medidas_mm": medidas,
                "perno": perno,
                "rodamiento": rodamiento,
                "cuerpo": cuerpo,
                "peso_kg": peso,
                "pagina": pcode,
            }
            if eje_pulg_lista:
                row["ejes_pulg_compatibles"] = eje_pulg_lista
            if perno_pulg:
                row["perno_pulg"] = perno_pulg
            if medidas_pulg:
                row["medidas_pulg"] = medidas_pulg
                avisos.append("medidas impresas solo en pulgadas; medidas_mm convertidas (x25,4)")
            # capacidades de carga (Cr/C0r) no se exportan: no forman parte del encargo
            if rod_print and rodamiento is None or (rod_print and norm_ref(rod_print)[0] and rod_print.replace('TL-', '') != (rodamiento or '')):
                row["rodamiento_impreso"] = rod_print
            if cuerpo_print and tab['left_kind'] == 'unit' and re.sub(r"^TL-", "", cuerpo_print) != cuerpo:
                row["cuerpo_impreso"] = cuerpo_print
            if peso is None:
                avisos.append("peso no impreso en el PDF")
            if insert_table:
                row["tipo"] = "inserto"
            if avisos:
                row["avisos"] = avisos
            row["_size"] = code
            row["_gid"] = (series, gid)
            built.append(row)
    return built

# ------------------------------------------- validaciones de serie (cruzadas)
def series_checks(rows, report):
    """Saltos de medidas/peso dentro de cada serie (por tamano)."""
    by = defaultdict(list)
    for r in rows:
        by[r['serie']].append(r)
    reject = set()
    for s, rs in by.items():
        # un valor por grupo (gid)
        gmap = {}
        for r in rs:
            gmap.setdefault(r['_gid'], r)
        gs = sorted(gmap.values(), key=lambda r: (r['eje_mm'] if r['eje_pulg'] is None else bore_mm(r['_size']), r['_size']))
        gs = sorted(gmap.values(), key=lambda r: bore_mm(r['_size']))
        letters = set(k for r in gs for k, v in r['medidas_mm'].items() if isinstance(v, (int, float)))
        flagged = defaultdict(list)
        for L in letters:
            seq = [(r['_gid'], r['medidas_mm'].get(L)) for r in gs if isinstance(r['medidas_mm'].get(L), (int, float))]
            for i, (gid, v) in enumerate(seq):
                prev = seq[i - 1][1] if i > 0 else None
                nxt = seq[i + 1][1] if i + 1 < len(seq) else None
                # pico aislado respecto a ambos vecinos
                if prev and nxt:
                    hi, lo = max(prev, nxt), min(prev, nxt)
                    up = v > 1.25 * hi and v - hi > 8
                    dn = v < lo - max(8, 0.10 * lo)
                    if up or dn:
                        flagged[gid].append(f"{L}={v} (vecinos {prev} / {nxt})")
        # salto escalon respecto al ultimo aceptado (medidas)
        for L in letters:
            last = None
            for r in gs:
                v = r['medidas_mm'].get(L)
                if not isinstance(v, (int, float)):
                    continue
                if r['_gid'] in flagged:
                    continue
                if last is not None:
                    ratio = v / last if last else 9
                    if (ratio > 2.2 or ratio < 0.6) and abs(v - last) > 10:
                        flagged[r['_gid']].append(f"{L}={v} salto brusco frente a {last}")
                        continue
                last = v
        # peso
        last, steps = None, 1
        for r in gs:
            w = r['peso_kg']
            if w is None:
                continue
            if r['_gid'] in flagged:
                continue
            if last is not None and not (0.8 <= w / last <= 2.6 ** steps):
                flagged[r['_gid']].append(f"peso {w} kg incoherente con el tamano anterior ({last} kg)")
                steps += 1
                continue
            last, steps = w, 1
        for gid, why in flagged.items():
            reject.add(gid)
            for r in rs:
                if r['_gid'] == gid:
                    report.append(dict(serie=s, pagina=r['pagina'], ref=r['ref'], motivo="valor atipico en la serie: " + "; ".join(why)))
    return [r for r in rows if r['_gid'] not in reject]

def insert_width_check(rows, report):
    """B/B1 y n del inserto deben coincidir con el valor mayoritario del mismo inserto en todo el PDF."""
    vals = defaultdict(list)
    def key(r):
        fam = 'SA' if r['serie'].startswith('SA') else 'SB' if r['serie'].startswith('SB') else 'UC'
        if r['serie'] in ('SSP000', 'SSFL000', 'SSK000', 'SSU000'):
            fam = 'MINI'
        return fam, r['_size']
    seen = set()
    for r in rows:
        if r['_gid'] in seen:
            continue
        seen.add(r['_gid'])
        m = r['medidas_mm']
        B = m.get('B1', m.get('B')) if r['serie'] not in ('UCP200', 'UCPX00', 'UCP300') else m.get('B')
        if r['serie'] in ('SSK000', 'SSU000'):
            continue
        n = m.get('n')
        if isinstance(B, (int, float)) and isinstance(n, (int, float)):
            vals[key(r)].append((r['_gid'], B, n))
    bad = set()
    for k, lst in vals.items():
        if len(lst) < 3:
            continue
        def maj(idx):
            c = Counter(round(x[idx] * 2) / 2 for x in lst)
            return c.most_common(1)[0][0]
        mb, mn = maj(1), maj(2)
        for gid, B, n in lst:
            if abs(B - mb) > 0.6 or abs(n - mn) > 0.6:
                bad.add((gid, f"anchura inserto B={B}, n={n} distinta de la mayoritaria en el PDF para {k[0]}{k[1]} (B~{mb}, n~{mn}); posible desplazamiento de columnas"))
    badg = {g for g, _ in bad}
    for g, why in bad:
        for r in rows:
            if r['_gid'] == g:
                report.append(dict(serie=r['serie'], pagina=r['pagina'], ref=r['ref'], motivo=why))
    return [r for r in rows if r['_gid'] not in badg]

def duplicate_table_check(rows, report):
    """Si dos series distintas tienen exactamente las mismas medidas y pesos en todos los tamanos
    comunes (>=3), la tabla posterior es una copia: se descarta entera y se avisa en la anterior."""
    fp = defaultdict(dict)
    page = {}
    for r in rows:
        fp[r['serie']][r['_size']] = (tuple(sorted((k, str(v)) for k, v in r['medidas_mm'].items())), r['peso_kg'])
        page.setdefault(r['serie'], int(r['pagina'][1:]))
    drop = {}
    ss = list(fp)
    for i, a in enumerate(ss):
        for b in ss[i + 1:]:
            common = set(fp[a]) & set(fp[b])
            if len(common) >= 3 and all(fp[a][c] == fp[b][c] for c in common):
                first, second = (a, b) if page[a] <= page[b] else (b, a)
                drop[second] = first
    for r in rows:
        if r['serie'] in drop:
            report.append(dict(serie=r['serie'], pagina=r['pagina'], ref=r['ref'],
                               motivo=f"la tabla {r['serie']} repite exactamente las medidas y pesos de {drop[r['serie']]} (copia en el PDF); datos no fiables"))
        elif r['serie'] in drop.values():
            src = [k for k, v in drop.items() if v == r['serie']]
            r.setdefault('avisos', []).append(f"el PDF repite exactamente estos valores en la tabla {', '.join(src)}; revisar con el fabricante")
    return [r for r in rows if r['serie'] not in drop]

# -------------------------------------------------------------------- main
def main():
    summaries = series_summaries()
    report, rows, tables_meta = [], [], []
    with pdfplumber.open(PDF) as pdf:
        for pn in TABLE_PAGES:
            page = pdf.pages[pn - 1]
            prow = page_rows(page)
            pcode = page_code(prow)
            tabs = find_tables(prow)
            for t in tabs:
                t['tab_rows'] = prow
                if t['hi'] is None:
                    continue
                tab = parse_table(t, pn, pcode, report)
                b = build_rows(tab, report, summaries)
                tables_meta.append(dict(serie=tab['series'], pagina=pcode, pagina_pdf=pn,
                                        letras=tab['dim_letters'], grupos=len(tab['groups']), filas_ok_previas=len(b)))
                rows += b
    rows = series_checks(rows, report)
    rows = duplicate_table_check(rows, report)
    rows = insert_width_check(rows, report)
    for r in rows:
        r.pop('_size', None); r.pop('_gid', None)
        def clean(v):
            if isinstance(v, float) and v.is_integer():
                return int(v)
            if isinstance(v, dict):
                return {k: clean(x) for k, x in v.items()}
            return v
        for k in list(r):
            r[k] = clean(r[k])
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "tl-soportes.json"), "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, "tl-soportes-descartes.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, "tl-tablas.json"), "w", encoding="utf-8") as f:
        json.dump(tables_meta, f, ensure_ascii=False, indent=1)
    cnt = Counter(r['serie'] for r in rows)
    for m in tables_meta:
        print(f"{m['pagina']:>4} {m['serie']:<9} letras={len(m['letras']):>2} grupos={m['grupos']:>3} ok={cnt.get(m['serie'],0)}")
    print("TOTAL filas:", len(rows), " descartes:", len([x for x in report if x.get('tipo') != 'info']))

if __name__ == "__main__":
    main()
