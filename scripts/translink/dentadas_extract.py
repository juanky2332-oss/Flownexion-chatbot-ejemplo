# -*- coding: utf-8 -*-
"""Extrae y valida las tablas de correas dentadas del catalogo TL (Translink).

Uso:  python -I dentadas_extract.py
Salida: ../out/tl-dentadas.json  +  ../out/tl-dentadas-informe.json (descartes, avisos, bloques)

Metodo:
  * pdfplumber.extract_words con coordenadas.
  * Cada tabla se ancla en la cabecera "BELT NO." / "REFERENCE"; las columnas de datos
    se localizan por las cabeceras "TEETH", "inch" y "mm" de ese bloque.
  * Dentro de cada bloque se forman 4 secuencias ordenadas en vertical
    (referencias, dientes, pulgadas, mm). Si todas tienen la misma longitud se
    emparejan por orden; si no, se emparejan por linea (misma coordenada y) y lo que
    no casa se descarta y se informa.
  * Validacion de cada fila: la referencia codifica el desarrollo (y en los clasicos
    sencillos tambien los dientes). Se exige: dientes enteros, dientes = los de la ref,
    desarrollo de tabla = desarrollo de la ref (+-0,5 %), dientes x paso = desarrollo
    (+-0,5 %) y, en pulgadas, pulg x 25,4 = mm (+-0,5 %). Cualquier fallo => descartada.
"""
import json, re, statistics, sys, os
import pdfplumber

# Ruta del PDF: primer argumento, o data/source/ del repo por defecto.
PDF = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data", "source", 'Correas dentadas TL.pdf')
OUTDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
TOL = 0.005
# Tolerancias absolutas: la ref redondea a 0,1" (o 1 mm); un diente de error siempre las supera.
ABS_TOL_INCH = 0.051
ABS_TOL_MM = 0.51

INCH_PITCH = {"MXL": 0.080, "XL": 0.200, "L": 0.375, "H": 0.500, "XH": 0.875, "XXH": 1.250}
METRIC_PITCH = {"3M": 3, "5M": 5, "8M": 8, "14M": 14, "20M": 20,
                "S3M": 3, "S4.5M": 4.5, "S5M": 5, "S8M": 8, "S14M": 14,
                "RPP3": 3, "RPP5": 5, "RPP8": 8, "RPP14": 14,
                "T2.5": 2.5, "T5": 5, "T10": 10, "AT5": 5, "AT10": 10}

# Anchos estandar transcritos de la tabla "Standard Belt Width" de cada perfil (pagina del perfil).
def inch_w(*pairs):
    return [f"{c} ({mm} mm)" for c, mm in pairs]
WIDTHS = {
    "MXL": inch_w(("012", "3,05"), ("019", "4,83"), ("025", "6,35"), ("031", "7,87")),
    "XL": inch_w(("025", "6,35"), ("031", "7,94"), ("037", "9,53"), ("050", "12,70"), ("075", "19,05"), ("100", "25,40")),
    "L": inch_w(("050", "12,70"), ("075", "19,05"), ("100", "25,40")),
    "H": inch_w(("075", "19,05"), ("100", "25,40"), ("150", "38,10"), ("200", "50,80"), ("300", "76,20")),
    "XH": inch_w(("200", "50,80"), ("300", "76,20"), ("400", "101,60")),
    "XXH": inch_w(("200", "50,80"), ("300", "76,20"), ("400", "101,60"), ("500", "127,0")),
    "D-XL": inch_w(("025", "6,35"), ("031", "7,94"), ("037", "9,53")),
    "D-L": inch_w(("050", "12,70"), ("075", "19,05"), ("100", "25,40")),
    # D-H: el PDF imprime "0,80" para el codigo 200 (2"); 2" = 50,80 mm
    "D-H": inch_w(("075", "19,05"), ("100", "25,40"), ("150", "38,10"), ("200", "50,80"), ("300", "76,20")),
    "3M": ["6", "9", "15"], "5M": ["9", "15", "25"], "8M": ["20", "30", "50"],
    "14M": ["40", "55", "85", "115", "170"],
    "D-5M": ["9", "15", "25"], "D-8M": ["20", "30", "50", "85"], "D-14M": ["40", "55", "85", "115", "170"],
    "S3M": ["6", "9", "15"], "S4.5M": ["6", "10", "15"], "S5M": ["9", "15", "25"],
    "S8M": ["20", "30", "50", "85"], "S14M": ["40", "55", "85", "115", "170"],
    "D-S5M": ["9", "15", "25"], "D-S8M": ["20", "30", "50", "85"],
    "RPP3": ["6", "9", "15"], "RPP5": ["9", "15", "25"], "RPP8": ["20", "30", "50", "85"],
    "RPP14": ["40", "55", "85", "115", "170"],
    "D-RPP5": ["9", "15", "25"], "D-RPP8": ["20", "30", "50", "85"], "D-RPP14": ["40", "55", "85", "115", "170"],
    "PU-MXL": inch_w(("012", "3,20"), ("019", "4,80"), ("025", "6,40")),
    "PU-XL": inch_w(("025", "6,40"), ("031", "7,90"), ("037", "9,40")),
    "PU-L": inch_w(("050", "12,70"), ("075", "19,10"), ("100", "25,40")),
    "PU-H": inch_w(("075", "19,10"), ("100", "25,40"), ("150", "38,10"), ("200", "50,80"), ("300", "76,20")),
    "T2.5": ["4", "6", "8", "10", "12"], "T5": ["6", "8", "10", "12", "16", "20", "25"],
    "T10": ["10", "12", "16", "20", "25", "32", "50", "75"],
    "D-T2.5": ["4", "6", "8", "10", "12"], "D-T5": ["6", "8", "10", "12", "16", "20", "25"],
    "D-T10": ["10", "12", "16", "20", "25", "32", "50", "75"],
    "AT5": ["6", "8", "10", "12", "16", "20", "25"], "AT10": ["10", "12", "16", "20", "25", "32", "50", "75"],
}


def num(s):
    return float(s.replace(",", "."))


def parse_ref(raw):
    """Devuelve dict con la interpretacion de la referencia, o None si no se reconoce."""
    t = raw.strip()
    star = "*" in t
    s = t.replace("*", "").rstrip("-")
    notes = []
    # clasico sencillo con dientes: TL-112XL-56
    m = re.fullmatch(r"TL-(\d+)(MXL|XXH|XH|XL|L|H)-(\d+)", s)
    if m:
        L, prof, z = m.groups()
        div = 100 if prof == "MXL" else 10
        return dict(ref=f"TL-{L}{prof}-{z}", perfil=prof, tipo="inch", len_ref=int(L) / div,
                    z_ref=int(z), star=star, notes=notes)
    # clasico sin dientes (XXH): TL-700XXH
    m = re.fullmatch(r"TL-(\d+)(XXH|XH|XL|L|H|MXL)", s)
    if m:
        L, prof = m.groups()
        div = 100 if prof == "MXL" else 10
        return dict(ref=f"TL-{L}{prof}", perfil=prof, tipo="inch", len_ref=int(L) / div,
                    z_ref=None, star=star, notes=notes)
    # clasico doble: TL-D-120XL (pulgadas x10)
    m = re.fullmatch(r"TL-D-(\d+)(XL|L|H|MXL|XH)", s)
    if m:
        L, prof = m.groups()
        return dict(ref=f"TL-D-{L}{prof}", perfil="D-" + prof, tipo="inch", len_ref=int(L) / 10,
                    z_ref=None, star=star, notes=notes)
    # PU pulgadas: TL-440PU-MXL (pulgadas x100)
    m = re.fullmatch(r"TL-(\d+)PU-?(MXL|XL|L|H)", s)
    if m:
        L, prof = m.groups()
        canon = f"TL-{L}PU-{prof}"
        if canon != s:
            notes.append(f"referencia impresa '{t}' normalizada a '{canon}'")
        return dict(ref=canon, perfil="PU-" + prof, tipo="inch", len_ref=int(L) / 100,
                    z_ref=None, star=star, notes=notes)
    # PU metrico: TL-120PU-T5, TL-D-410PU-T5, TL-225PU-AT5
    m = re.fullmatch(r"TL-(D-)?(\d+(?:\.\d+)?)-?PU-(T2\.5|T5|T10|AT5|AT10)", s)
    if m:
        d, L, prof = m.groups()
        canon = f"TL-{d or ''}{L}PU-{prof}"
        if canon != s:
            notes.append(f"referencia impresa '{t}' normalizada a '{canon}'")
        return dict(ref=canon, perfil=(d or "") + prof, tipo="mm", len_ref=float(L),
                    z_ref=None, star=star, notes=notes)
    # metrico caucho: TL-600-8M, TL-D-512-8M, TL-150-S5M, TL-248-RPP8
    m = re.fullmatch(r"TL-(D-)?(\d+(?:\.\d+)?)-?(3M|5M|8M|14M|20M|S3M|S4\.5M|S5M|S8M|S14M|RPP3|RPP5|RPP8|RPP14)", s)
    if m:
        d, L, prof = m.groups()
        canon = f"TL-{d or ''}{L}-{prof}"
        if canon != s:
            notes.append(f"referencia impresa '{t}' normalizada a '{canon}'")
        return dict(ref=canon, perfil=(d or "") + prof, tipo="mm", len_ref=float(L),
                    z_ref=None, star=star, notes=notes)
    return None


def familia(perfil):
    base = perfil[2:] if perfil.startswith("D-") else perfil
    dbl = perfil.startswith("D-")
    if base in INCH_PITCH:
        return "Clásico trapezoidal (pulgadas)" + (", doble cara" if dbl else "")
    if base in ("3M", "5M", "8M", "14M", "20M"):
        return "HTD (curvilíneo)" + (", doble cara" if dbl else "")
    if base.startswith("S"):
        return "STD Super Torque (curvilíneo)" + (", doble cara" if dbl else "")
    if base.startswith("RPP"):
        return "RPP parabólico reforzado" + (", doble cara" if dbl else "")
    if base.startswith("PU-"):
        return "Poliuretano, perfil clásico (pulgadas)"
    if base.startswith("AT"):
        return "Poliuretano AT (métrico)"
    if base.startswith("T"):
        return "Poliuretano T (métrico)" + (", doble cara" if dbl else "")
    return "?"


def pitch_of(perfil):
    base = perfil[2:] if perfil.startswith("D-") else perfil
    base = base[3:] if base.startswith("PU-") else base
    if base in INCH_PITCH:
        return "inch", INCH_PITCH[base]
    return "mm", METRIC_PITCH[base]


def rel(a, b):
    return abs(a - b) / b if b else 1.0


NUMRE = re.compile(r"^\d+(,\d+)?$")


def extract():
    pdf = pdfplumber.open(PDF)
    blocks = []
    for pno, page in enumerate(pdf.pages, start=1):
        code = f"E{pno - 1}"
        ws = page.extract_words()
        anchors = []
        for w in ws:
            if w["text"] == "REFERENCE" or (w["text"] == "BELT" and any(
                    v["text"] == "NO." and abs(v["top"] - w["top"]) < 2 and 0 < v["x0"] - w["x1"] < 6 for v in ws)):
                anchors.append(w)
        if not anchors:
            continue
        # bandas horizontales de anclas (misma fila de cabeceras)
        anchors.sort(key=lambda a: (round(a["top"]), a["x0"]))
        bands = []
        for a in anchors:
            for b in bands:
                if abs(b[0]["top"] - a["top"]) < 4:
                    b.append(a); break
            else:
                bands.append([a])
        for bi, band in enumerate(bands):
            band.sort(key=lambda a: a["x0"])
            top0 = band[0]["top"]
            # limite inferior: siguiente banda por debajo
            lower = [b[0]["top"] for b in bands if b[0]["top"] > top0 + 20]
            ybot = (min(lower) - 45) if lower else page.height
            for ai, a in enumerate(band):
                xl = 0 if ai == 0 else band[ai]["x0"] - 15
                xr = page.width if ai == len(band) - 1 else band[ai + 1]["x0"] - 15
                inx = lambda w: xl <= (w["x0"] + w["x1"]) / 2 < xr
                teeth_h = [w for w in ws if w["text"] == "TEETH" and inx(w) and -2 < w["top"] - a["top"] < 14]
                sub = [w for w in ws if w["text"] in ("inch", "mm") and inx(w) and 5 < w["top"] - a["top"] < 32]
                cols = {}
                if teeth_h:
                    cols["z"] = (teeth_h[0]["x0"] + teeth_h[0]["x1"]) / 2
                for w in sub:
                    cols[w["text"]] = (w["x0"] + w["x1"]) / 2
                ystart = max([a["top"]] + [w["top"] for w in sub]) + 4
                refs = sorted([w for w in ws if w["text"].startswith("TL-") and inx(w)
                               and ystart <= w["top"] < ybot], key=lambda w: w["top"])
                seqs = {}
                for key, cx in cols.items():
                    cand = sorted([w for w in ws if NUMRE.match(w["text"]) and ystart <= w["top"] < ybot
                                   and abs((w["x0"] + w["x1"]) / 2 - cx) < 12], key=lambda w: w["top"])
                    seq = []
                    for w in cand:
                        if seq and w["top"] - seq[-1]["top"] > 60:
                            break
                        seq.append(w)
                    seqs[key] = seq
                blocks.append(dict(page=pno, code=code, anchor=(round(a["x0"]), round(a["top"])),
                                   refs=refs, seqs=seqs, cols=cols))
    # cobertura: toda palabra "TL-" de las paginas con tablas debe caer en algun bloque
    used = {(b["page"], round(r["x0"], 1), round(r["top"], 1)) for b in blocks for r in b["refs"]}
    for pno, page in enumerate(pdf.pages, start=1):
        if not any(b["page"] == pno for b in blocks):
            continue
        for w in page.extract_words():
            if w["text"].startswith("TL-") and (pno, round(w["x0"], 1), round(w["top"], 1)) not in used:
                ORPHAN_REFS.append(dict(pagina=f"E{pno - 1}", ref=w["text"]))
    return blocks


ORPHAN_REFS = []


def main():
    blocks = extract()
    out, discards, warnings, binfo = [], [], [], []
    seen = {}
    for b in blocks:
        refs, seqs = b["refs"], b["seqs"]
        counts = {"refs": len(refs), **{k: len(v) for k, v in seqs.items()}}
        if not refs:
            continue
        n = len(refs)
        same = all(len(v) == n for v in seqs.values())
        rows = []
        mode = "orden"
        if same:
            misal = 0
            for i, r in enumerate(refs):
                row = {k: seqs[k][i] for k in seqs}
                if any(abs(w["top"] - r["top"]) > 3 for w in row.values()):
                    misal += 1
                rows.append((r, row))
        else:
            mode = "linea"
            misal = None
            for r in refs:
                row = {}
                for k, seq in seqs.items():
                    c = [w for w in seq if abs(w["top"] - r["top"]) <= 2.5]
                    if len(c) == 1:
                        row[k] = c[0]
                rows.append((r, row))
            used = {k: {id(w) for _, row in rows for kk, w in row.items() if kk == k} for k in seqs}
            for k, seq in seqs.items():
                for w in seq:
                    if id(w) not in used[k]:
                        discards.append(dict(pagina=b["code"], ref=None, motivo=f"valor huérfano en columna {k}: {w['text']} (sin referencia en su línea)"))
        binfo.append(dict(pagina=b["code"], ancla=b["anchor"], conteos=counts, emparejado=mode,
                          filas_desalineadas_en_y=misal))
        for r, row in rows:
            raw = r["text"]
            info = parse_ref(raw)
            if info is None:
                discards.append(dict(pagina=b["code"], ref=raw, motivo="referencia con formato no reconocible / mal impresa",
                                     tabla={k: w["text"] for k, w in row.items()}))
                continue
            perfil = info["perfil"]
            unit, p = pitch_of(perfil)
            tab = {k: w["text"] for k, w in row.items()}
            need = ["z", "mm"] + (["inch"] if unit == "inch" else [])
            missing = [k for k in need if k not in row]
            if missing:
                discards.append(dict(pagina=b["code"], ref=raw, motivo=f"no se pudo emparejar con fila de datos (falta {missing})", tabla=tab))
                continue
            errs = []
            zt = row["z"]["text"]
            if "," in zt:
                errs.append(f"nº de dientes no entero en tabla ({zt})")
                z = None
            else:
                z = int(zt)
            mm = num(row["mm"]["text"])
            inch = num(row["inch"]["text"]) if unit == "inch" else None
            if z is not None:
                if info["z_ref"] is not None and z != info["z_ref"]:
                    errs.append(f"dientes tabla {z} ≠ dientes en referencia {info['z_ref']}")
                L = inch if unit == "inch" else mm
                u = '"' if unit == "inch" else " mm"
                atol = ABS_TOL_INCH if unit == "inch" else ABS_TOL_MM
                # la referencia (redondeada) debe implicar el mismo nº de dientes
                if round(info["len_ref"] / p) != z:
                    errs.append(f"la referencia ({info['len_ref']:g}{u}) implica {info['len_ref'] / p:.2f} dientes, la tabla dice {z}")
                if rel(L, info["len_ref"]) > TOL or abs(L - info["len_ref"]) > atol:
                    errs.append(f"desarrollo tabla {L:g}{u} ≠ referencia {info['len_ref']:g}{u}")
                if rel(z * p, L) > TOL or abs(z * p - L) > atol:
                    errs.append(f"{z} dientes × {p:g}{u} = {z * p:.3f}{u} ≠ tabla {L:g}{u}")
                if unit == "inch":
                    ex = z * p * 25.4
                    if abs(mm - ex) > min(1.3, 0.4 * p * 25.4):
                        errs.append(f"mm de tabla {mm:g} ≠ {z} dientes × {p * 25.4:g} mm = {ex:.2f} mm")
            if errs:
                discards.append(dict(pagina=b["code"], ref=raw, motivo="; ".join(errs), tabla=tab))
                continue
            paso_mm = round(p * 25.4, 3) if unit == "inch" else p
            exact_mm = z * paso_mm
            rec = {"ref": info["ref"], "perfil": perfil, "familia": familia(perfil),
                   "paso_mm": paso_mm}
            if unit == "inch":
                rec["paso_pulg"] = p
            rec.update({"dientes": z, "desarrollo_mm": mm,
                        "desarrollo_pulg": inch})
            if perfil.startswith("D-"):
                rec["doble_cara"] = True
            if info["star"]:
                rec["doble_cara_disponible"] = True
            if perfil in WIDTHS:
                rec["anchos"] = WIDTHS[perfil]
            rec["pagina"] = b["code"]
            if info["notes"]:
                rec["ref_impresa"] = raw.rstrip("-")
                warnings.append(dict(pagina=b["code"], ref=raw, aviso="; ".join(info["notes"])))
            if abs(mm - exact_mm) > 0.06:
                rec["desarrollo_mm_exacto"] = round(exact_mm, 2)
                if unit == "inch":
                    rec["desarrollo_pulg_exacto"] = round(z * p, 3)
                warnings.append(dict(pagina=b["code"], ref=info["ref"],
                                     aviso=f"mm impreso {mm:g} difiere de {z}×{paso_mm:g} = {exact_mm:.2f} (valor nominal/redondeado del catálogo; se conserva el impreso y se añade desarrollo_mm_exacto)"))
            key = info["ref"]
            if key in seen:
                prev = seen[key]
                if (prev["dientes"], prev["desarrollo_mm"]) == (z, mm):
                    warnings.append(dict(pagina=b["code"], ref=key, aviso="duplicada en el catálogo con los mismos datos; se deja una sola"))
                    continue
                discards.append(dict(pagina=b["code"], ref=raw, motivo=f"referencia repetida con datos distintos a la de {prev['pagina']}", tabla=tab))
                continue
            seen[key] = rec
            out.append(rec)
    os.makedirs(OUTDIR, exist_ok=True)
    with open(os.path.join(OUTDIR, "tl-dentadas.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUTDIR, "tl-dentadas-informe.json"), "w", encoding="utf-8") as f:
        json.dump(dict(refs_fuera_de_tabla=ORPHAN_REFS, bloques=binfo, descartadas=discards, avisos=warnings), f, ensure_ascii=False, indent=1)
    from collections import Counter
    c = Counter(r["perfil"] for r in out)
    print("filas OK:", len(out))
    for k, v in c.items():
        print(f"  {k}: {v}")
    print("descartadas:", len(discards), " avisos:", len(warnings), " refs fuera de tabla:", ORPHAN_REFS)


if __name__ == "__main__":
    main()
