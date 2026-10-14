# -*- coding: utf-8 -*-
"""
Extrae Ld / Li del catálogo "Correas industriales TL.pdf" (Translink) con coordenadas
(pdfplumber.extract_words). Empareja ref <-> valores por FILA IMPRESA (misma 'top')
y asigna cada número a la columna de cabecera (Ld / Li) más cercana en x.
Valida: Ld-Li constante por perfil (±3 mm de la mediana), coherencia con la longitud
contenida en la referencia (métrica exacta / pulgadas ×25,4), orden creciente en
las tablas cuya ref es la propia longitud. Lo dudoso NO va a la salida principal.

Uso:  python -I ind_extract_tl_industriales.py
"""
import os
import json, re, statistics, sys
from collections import defaultdict, Counter
import pdfplumber

sys.stdout.reconfigure(encoding="utf-8")
# Ruta del PDF: primer argumento, o data/source/ del repo por defecto.
PDF = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data", "source", 'Correas industriales TL.pdf')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

NUM = re.compile(r"^\d+$")
FRAC = re.compile(r"^\d/\d$")

FAM_CLAS_ENV = "Clásica envuelta DIN 2215 / ISO 4184"
FAM_CLAS_X = "Clásica dentada Raw Edge Cogged DIN 2215 / ISO 4184"
FAM_EST_ENV = "Estrecha envuelta DIN 7753 / ISO 4184"
FAM_EST_X = "Estrecha dentada Raw Edge Cogged DIN 7753 / ISO 4184"
FAM_VAR = "Variador de velocidad DIN 7719-1 / ISO 1604"
FAM_BAND_CLAS = "Banda múltiple (Banded) clásica DIN 2215 / ISO 4184"
FAM_BAND_EST = "Banda múltiple (Banded) estrecha DIN 7753 / ISO 4184"

# página (índice 0) -> tipo de tabla
PAGES_LDLI = [4, 5, 6, 7, 8]          # REF | Ld | Li
PAGES_LD_X = [9, 10]                  # REF | Ld   (AX/BX/CX/ZX)
PAGES_SP = [11, 12, 13]               # "TL-SPZ" <Ld>  (la ref es la propia Ld)
PAGES_VAR = [20, 21]                  # REF | **DATUM
PAGE_BAND_ABC = 23                    # REF | INSIDE Li
PAGE_BAND_SP = 24                     # REF(con longitud) | Ld
PAGES_OTHER = {15: "exterior", 16: "exterior", 18: "efectiva", 25: "exterior", 26: "exterior"}

pdf = pdfplumber.open(PDF)
rows_ok, avisos, descartes, otras = [], [], [], []


def page_code(pn):
    ws = [w["text"] for w in pdf.pages[pn].extract_words() if w["top"] > 800]
    return ws[0] if ws else f"D{pn}"


def words(pn):
    return pdf.pages[pn].extract_words()


def group_rows(ws, tol=2.5):
    """agrupa palabras en filas por 'top' (tolerancia pequeña)."""
    ws = sorted(ws, key=lambda w: (w["top"], w["x0"]))
    rows = []
    for w in ws:
        if rows and abs(rows[-1][0] - w["top"]) <= tol:
            rows[-1][1].append(w)
        else:
            rows.append([w["top"], [w]])
    return [(t, sorted(r, key=lambda w: w["x0"])) for t, r in rows]


def is_ref_start(t):
    return t.startswith("TL") or t.startswith("2TL")


NOISE = {"mm", "mm.", "*", "**", "All", "measures", "in"}
LABEL = re.compile(r"^(?:[A-Z]{1,2}/\d+|Y/6)$")


def clean_row(row):
    """quita etiquetas de los dibujos de sección ('6 mm', 'A/13') y el pie '* All measures in mm.'"""
    out, skip = [], set()
    for i, w in enumerate(row):
        if i + 1 < len(row) and row[i + 1]["text"] == "mm" and NUM.match(w["text"]):
            skip.add(i)
    for i, w in enumerate(row):
        if i in skip or w["text"] in NOISE or LABEL.match(w["text"]):
            continue
        out.append(w)
    return out


def split_records(row):
    """divide una fila en registros: [tokens de ref..., números...] empezando en cada TL."""
    recs, cur, orphans = [], None, []
    row = clean_row(row)
    for w in row:
        t = w["text"]
        if is_ref_start(t):
            cur = {"ref": [w], "vals": [], "bad": []}
            recs.append(cur)
        elif cur is None:
            orphans.append(w)
        elif NUM.match(t):
            cur["vals"].append(w)
        elif not cur["vals"]:
            cur["ref"].append(w)          # 1/2, x, 6-425, E118 tras "TL", -800 ...
        else:
            cur["bad"].append(w)
    return recs, orphans


def norm_ref(tokens):
    toks = [w["text"] for w in tokens]
    notes = []
    if toks[0] == "TL" and len(toks) > 1:          # "TL" "E118" -> TL-E118
        toks = ["TL-" + toks[1]] + toks[2:]
        notes.append("ref partida en el PDF ('TL' + resto); unida como TL-…")
    if toks[0].startswith("2TL-"):
        notes.append(f"ref impresa '{toks[0]}' (errata '2' delante)")
        toks[0] = toks[0][1:]
    s = ""
    for t in toks:
        if not s:
            s = t
        elif t.startswith("-"):
            s += t
        else:
            s += " " + t
    return re.sub(r"\s+", " ", s).strip(), notes


def header_cols(rows, labels=("Ld", "Li")):
    """filas de cabecera con 'Ld'/'Li' -> lista de (top, [(xcentro, etiqueta)])"""
    out = []
    for t, r in rows:
        cols = [((w["x0"] + w["x1"]) / 2, w["text"]) for w in r if w["text"] in labels]
        if len(cols) >= 1 and len(cols) == len(r):
            out.append((t, cols))
    return out


def inch_value(s):
    """'Z12 1/2' -> 12.5 ; 'A49' -> 49"""
    m = re.match(r"^[A-Z]+(\d+)(?: (\d)/(\d))?$", s)
    if not m:
        return None
    v = float(m.group(1))
    if m.group(2):
        v += int(m.group(2)) / int(m.group(3))
    return v


def perfil_clasico(core):
    for p, name in (("ZX", "ZX/10"), ("AX", "AX/13"), ("BX", "BX/17"), ("CX", "CX/22"),
                    ("Z", "Z/10"), ("A", "A/13"), ("B", "B/17"), ("C", "C/22"), ("D", "D/32"), ("E", "E/40")):
        if re.match(rf"^{p}\d", core):
            return name
    return None


# ---------------------------------------------------------------- tablas Ld+Li / Ld (clásicas)
def tabla_columnas(pn, familia, expect):
    code = page_code(pn)
    rows = group_rows(words(pn))
    hdrs = header_cols(rows)
    if not hdrs:
        raise SystemExit(f"sin cabecera Ld/Li en página {pn}")
    for i, (ht, cols) in enumerate(hdrs):
        end = hdrs[i + 1][0] - 40 if i + 1 < len(hdrs) else 780
        foot = [t for t, r in rows if t > ht and len(r) >= 2 and r[0]["text"] == "*" and r[1]["text"] == "All"]
        if foot:
            end = min(end, foot[0])
        for t, r in rows:
            if not (ht + 5 < t < end):
                continue
            recs, orphans = split_records(r)
            # números huérfanos (sin ref en la fila / antes de la primera ref)
            for k, w in enumerate(orphans):
                if NUM.match(w["text"]):
                    if True:
                        descartes.append({"pagina": code, "ref": None, "motivo": f"número '{w['text']}' sin referencia en su fila (top {t:.0f}, x {w['x0']:.0f})"})
            for rec in recs:
                ref, notes = norm_ref(rec["ref"])
                vals = {}
                problems = []
                for w in rec["vals"]:
                    xc = (w["x0"] + w["x1"]) / 2
                    d, lab = min((abs(xc - cx), lab) for cx, lab in cols)
                    if d > 25:
                        problems.append(f"valor {w['text']} fuera de columna (dist {d:.0f})")
                    elif lab in vals:
                        problems.append(f"dos valores para {lab}")
                    else:
                        vals[lab] = int(w["text"])
                for w in rec["bad"]:
                    problems.append(f"token no numérico '{w['text']}' en columna de valores")
                missing = [l for l in expect if l not in vals]
                if missing:
                    problems.append("falta " + "/".join(missing))
                core = ref[3:] if ref.startswith("TL-") else ref
                if ref.startswith("TL-Y/6-"):
                    perfil = "Y/6"
                elif ref.startswith("TL-20-"):
                    perfil = "20"
                elif ref.startswith("TL-25-"):
                    perfil = "25"
                else:
                    perfil = perfil_clasico(core)
                if perfil is None:
                    problems.append("perfil no reconocido")
                row = {"ref": ref, "perfil": perfil, "familia": familia,
                       "ld_mm": vals.get("Ld"), "li_mm": vals.get("Li"), "pagina": code}
                if problems:
                    descartes.append({**row, "motivo": "; ".join(problems)})
                else:
                    row["_notes"] = notes
                    row["_top"] = round(t, 1)
                    row["_x"] = round(rec["ref"][0]["x0"])
                    rows_ok.append(row)


# ---------------------------------------------------------------- tablas estrechas (ref = Ld)
def tabla_sp(pn, familia_fn):
    code = page_code(pn)
    rows = group_rows(words(pn))
    for t, r in rows:
        if t < 140 or t > 660:
            continue
        recs, orphans = split_records(r)
        for w in orphans:
            if NUM.match(w["text"]):
                descartes.append({"pagina": code, "ref": None, "motivo": f"número '{w['text']}' sin referencia (top {t:.0f})"})
        for rec in recs:
            ref0, notes = norm_ref(rec["ref"])
            if len(rec["vals"]) != 1 or rec["bad"] or " " in ref0:
                descartes.append({"pagina": code, "ref": ref0, "motivo": "registro irregular: " + " ".join(w["text"] for w in rec["ref"] + rec["vals"] + rec["bad"])})
                continue
            ld = int(rec["vals"][0]["text"])
            pref = ref0[3:]
            fam = familia_fn(pref)
            rows_ok.append({"ref": f"{ref0}{ld}", "perfil": pref, "familia": fam, "ld_mm": ld, "li_mm": None,
                            "pagina": code, "_notes": notes, "_top": round(t, 1),
                            "_x": round(rec["ref"][0]["x0"])})


# ---------------------------------------------------------------- variador de velocidad
def tabla_var(pn):
    code = page_code(pn)
    rows = group_rows(words(pn))
    for t, r in rows:
        if t < 105 or t > 780:
            continue
        recs, orphans = split_records(r)
        for rec in recs:
            ref, notes = norm_ref(rec["ref"])
            m_v = re.match(r"^TL-V(\d+) x (\d+)-(\d+)$", ref)
            m_w = re.match(r"^TL-W([\d,]+)-(\d+)$", ref)
            perfil = f"{m_v.group(1)}x{m_v.group(2)}" if m_v else (f"W{m_w.group(1)}" if m_w else None)
            row = {"ref": ref, "perfil": perfil, "familia": FAM_VAR, "ld_mm": None, "li_mm": None, "pagina": code}
            if len(rec["vals"]) != 1 or rec["bad"] or perfil is None:
                descartes.append({**row, "motivo": "sin Ld impresa" if not rec["vals"] else "registro irregular: " + " ".join(w["text"] for w in rec["ref"] + rec["vals"] + rec["bad"])})
                continue
            row["ld_mm"] = int(rec["vals"][0]["text"])
            row["_refnum"] = int(m_v.group(3)) if m_v else int(m_w.group(2))
            row["_notes"] = notes
            row["_top"] = round(t, 1)
            row["_x"] = round(rec["ref"][0]["x0"])
            rows_ok.append(row)


# ---------------------------------------------------------------- banded
def tabla_band(pn, kind):
    code = page_code(pn)
    rows = group_rows(words(pn))
    for t, r in rows:
        if t < 105 or t > 780:
            continue
        recs, orphans = split_records(r)
        for rec in recs:
            ref, notes = norm_ref(rec["ref"])
            row = {"ref": ref, "perfil": None, "familia": None, "ld_mm": None, "li_mm": None, "pagina": code}
            if len(rec["vals"]) != 1 or rec["bad"]:
                descartes.append({**row, "motivo": "registro irregular"})
                continue
            v = int(rec["vals"][0]["text"])
            if kind == "abc":
                m = re.match(r"^TL-([ABC])(\d+)$", ref)
                if not m:
                    descartes.append({**row, "li_mm": v, "familia": FAM_BAND_CLAS, "motivo": f"referencia con formato anómalo '{ref}' (¿errata?)"})
                    continue
                row.update(perfil={"A": "A/13", "B": "B/17", "C": "C/22"}[m.group(1)], familia=FAM_BAND_CLAS, li_mm=v)
            else:
                m = re.match(r"^TL-(SP[ZABC])(\d+)$", ref)
                if not m:
                    descartes.append({**row, "motivo": "ref no reconocida"})
                    continue
                row.update(perfil=m.group(1), familia=FAM_BAND_EST, ld_mm=v)
                if int(m.group(2)) != v:
                    descartes.append({**row, "motivo": f"la ref indica {m.group(2)} y la tabla {v}"})
                    continue
            row["_notes"] = notes
            row["_x"] = round(rec["ref"][0]["x0"])
            row["_top"] = round(t, 1)
            rows_ok.append(row)


# ---------------------------------------------------------------- otras longitudes (fuera de alcance Li/Ld)
def tabla_otras(pn, tipo):
    code = page_code(pn)
    rows = group_rows(words(pn))
    for t, r in rows:
        if t < 105 or t > 560:
            continue
        toks = [w["text"] for w in r]
        if pn in (15, 16):     # TL-3V250 TL-9N635 -> pares (ref, ref equivalente con longitud exterior)
            for a, b in zip(toks[0::2], toks[1::2]):
                m = re.match(r"^TL-\d+NX?(\d+)$", b)
                if a.startswith("TL-") and m:
                    otras.append({"ref": a, "ref_equivalente": b, "longitud_mm": int(m.group(1)), "tipo_longitud": "exterior", "pagina": code})
        elif pn == 18:
            for a, b in zip(toks[0::2], toks[1::2]):
                if a.startswith("TL-") and NUM.match(b):
                    otras.append({"ref": a, "longitud_mm": int(b), "tipo_longitud": "efectiva", "pagina": code})
        else:                  # 25/26: indicación | ref | outside
            for a, b, c in zip(toks[0::3], toks[1::3], toks[2::3]):
                if b.startswith("TL-") and NUM.match(c):
                    m = re.match(r"^TL-\d+JX?(\d+)$", b)
                    ok = m and int(m.group(1)) == int(c)
                    otras.append({"ref": b, "indicacion": a, "longitud_mm": int(c), "tipo_longitud": "exterior",
                                  "familia": "Banda múltiple ARPM/MPTA IP-22", "pagina": code, **({} if ok else {"aviso": "ref y valor no coinciden"})})


for pn in PAGES_LDLI:
    tabla_columnas(pn, FAM_CLAS_ENV, ("Ld", "Li"))
for pn in PAGES_LD_X:
    tabla_columnas(pn, FAM_CLAS_X, ("Ld",))
for pn in PAGES_SP:
    tabla_sp(pn, lambda p: FAM_EST_ENV if p.startswith("SP") else FAM_EST_X)
for pn in PAGES_VAR:
    tabla_var(pn)
tabla_band(PAGE_BAND_ABC, "abc")
tabla_band(PAGE_BAND_SP, "sp")
for pn, tipo in PAGES_OTHER.items():
    tabla_otras(pn, tipo)

# ================================================================ VALIDACIÓN
def reject(row, motivo, categoria="errata_o_incoherencia"):
    descartes.append({k: v for k, v in row.items() if not k.startswith("_")} | {"motivo": motivo, "categoria": categoria})
    row["_rej"] = True

# 1) Ld - Li constante por (familia, perfil)
med = {}
by = defaultdict(list)
for r in rows_ok:
    if r["ld_mm"] is not None and r["li_mm"] is not None:
        by[(r["familia"], r["perfil"])].append(r["ld_mm"] - r["li_mm"])
for k, ds in by.items():
    med[k] = statistics.median(ds)
for r in rows_ok:
    k = (r["familia"], r["perfil"])
    if r["ld_mm"] is not None and r["li_mm"] is not None:
        d = r["ld_mm"] - r["li_mm"]
        if abs(d - med[k]) > 3:
            reject(r, f"Ld−Li = {d} mm, mediana del perfil {med[k]:g} mm (desvío {d - med[k]:+g})")

# diferencia de referencia por perfil base (para Ld-only clásicas X)
base_diff = {p: med[(FAM_CLAS_ENV, p)] for (f, p) in med if f == FAM_CLAS_ENV}

# 2) coherencia con la longitud de la referencia
INCH_TOL = 12.7  # mm: media pulgada -> el nº de la ref deja de ser la pulgada más cercana
for r in rows_ok:
    if r.get("_rej"):
        continue
    ref = r["ref"]
    m = re.match(r"^TL-(?:Y/6|20|25)-(\d+)$", ref)
    if m:
        if r["li_mm"] != int(m.group(1)):
            reject(r, f"la ref indica Li {m.group(1)} y la tabla da Li {r['li_mm']}")
        continue
    if r["familia"] in (FAM_CLAS_ENV, FAM_CLAS_X, FAM_BAND_CLAS):
        core = ref[3:]
        inches = inch_value(core)
        if inches is None:
            reject(r, "no se puede leer la longitud en pulgadas de la ref")
            continue
        exp = inches * 25.4
        if r["li_mm"] is not None:
            li, how = r["li_mm"], "Li"
        else:
            base = r["perfil"].replace("X", "", 1) if r["perfil"].startswith(("ZX", "AX", "BX", "CX")) else r["perfil"]
            li, how = r["ld_mm"] - base_diff[base], f"Li implícita (Ld − {base_diff[base]:g})"
        r["_inch_dev"] = round(li - exp, 1)
        if abs(li - exp) > INCH_TOL:
            cat = "redondeo_metrico_catalogo" if abs(li - exp) <= 20 else "errata_o_incoherencia"
            reject(r, f"{how} = {li:g} mm vs {inches:g}\" × 25,4 = {exp:.0f} mm (desvío {li - exp:+.0f} mm)", cat)
    if r["familia"] == FAM_VAR:
        pass

# 3) variador: W -> Ld == nº de la ref ; V -> Ld − nº ref constante por perfil
vd = defaultdict(list)
for r in rows_ok:
    if r["familia"] == FAM_VAR and not r.get("_rej"):
        if r["perfil"].startswith("W"):
            if r["ld_mm"] != r["_refnum"]:
                reject(r, f"W: la ref indica {r['_refnum']} y Ld {r['ld_mm']}")
        else:
            vd[r["perfil"]].append(r["ld_mm"] - r["_refnum"])
vmed = {p: statistics.median(v) for p, v in vd.items()}
for r in rows_ok:
    if r["familia"] == FAM_VAR and not r.get("_rej") and not r["perfil"].startswith("W"):
        d = r["ld_mm"] - r["_refnum"]
        if abs(d - vmed[r["perfil"]]) > 3:
            reject(r, f"Ld − nº de ref = {d}, mediana del perfil {vmed[r['perfil']]:g}")

# 4) orden creciente por columna impresa (todas las tablas): una ruptura delata errata
cols = defaultdict(list)
for r in rows_ok:
    if not r.get("_rej"):
        cols[(r["pagina"], r["_x"] // 15, r["perfil"])].append(r)
for k, lst in cols.items():
    lst.sort(key=lambda r: r["_top"])
    for r in lst:
        r["_k"] = r["ld_mm"] if r["ld_mm"] is not None else r["li_mm"]
    bad = []
    for i in range(1, len(lst)):
        a, b = lst[i - 1], lst[i]
        if b["_k"] <= a["_k"]:
            # ¿cuál sobra? el que no cabe entre sus vecinos; si es ambiguo, ambos
            cand = []
            if i + 1 >= len(lst) or not (a["ld_mm"] < lst[i + 1]["ld_mm"]) or True:
                pa = lst[i - 2]["_k"] if i >= 2 else -1
                nb = lst[i + 1]["_k"] if i + 1 < len(lst) else 10**9
                a_fits = pa < a["_k"] < nb
                b_fits = pa < b["_k"] < nb
                if a_fits and not b_fits:
                    cand = [b]
                elif b_fits and not a_fits:
                    cand = [a]
                else:
                    cand = [a, b]
            for c in cand:
                bad.append((c, a, b))
    for c, a, b in bad:
        if not c.get("_rej"):
            reject(c, f"rompe el orden creciente de su columna ({a['ref']} → {b['ref']}); posible errata de impresión")
# orden creciente también en clásicas (por columna)
cols2 = defaultdict(list)
# 5) duplicados dentro de la misma familia
cnt = Counter((r["familia"], r["ref"]) for r in rows_ok if not r.get("_rej"))
for r in rows_ok:
    if not r.get("_rej") and cnt[(r["familia"], r["ref"])] > 1:
        reject(r, "referencia duplicada dentro de la misma familia")

final = [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows_ok if not r.get("_rej")]
json.dump(final, open(OUT + r"\tl-industriales.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(descartes, open(OUT + r"\tl-industriales-descartes.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(otras, open(OUT + r"\tl-industriales-otras-longitudes.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- informe
print("TOTAL salida:", len(final), "| descartes:", len(descartes), "| otras longitudes:", len(otras))
c = Counter((r["familia"], r["perfil"]) for r in final)
print("\nFilas por familia/perfil (+ mediana Ld−Li):")
for (f, p), n in sorted(c.items()):
    m = med.get((f, p))
    if f == FAM_VAR and p in vmed:
        extra = f"Ld − nº ref = {vmed[p]:g}"
    else:
        extra = f"Ld−Li med {m:g}" if m is not None else ""
    print(f"  {f:55s} {str(p):8s} {n:4d}  {extra}")
print("\nDESCARTES:")
for d in descartes:
    print("  ", d.get("pagina"), d.get("ref"), "| Ld", d.get("ld_mm"), "Li", d.get("li_mm"), "|", d["motivo"])
print("\nNOTAS en filas aceptadas:")
for r in rows_ok:
    if r.get("_notes") and not r.get("_rej"):
        print("  ", r["pagina"], r["ref"], r["_notes"])
devs = [r["_inch_dev"] for r in rows_ok if "_inch_dev" in r and not r.get("_rej")]
if devs:
    print("\nDesvío Li vs pulgadas (aceptadas): min %.1f max %.1f mediana %.1f" % (min(devs), max(devs), statistics.median(devs)))
