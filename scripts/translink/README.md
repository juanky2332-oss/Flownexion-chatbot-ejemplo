# Extracción de los catálogos Translink (TL)

Scripts que leen los PDF de Translink por coordenadas (pdfplumber) y validan cada fila
antes de aceptarla. Generan los JSON de `out/`, que luego se copian a `data/kb/`.

| Script | PDF (en `data/source/`) | Salida |
|--------|-------------------------|--------|
| `dentadas_extract.py` | Correas dentadas TL.pdf | `out/tl-dentadas.json` |
| `ind_extract_tl_industriales.py` | Correas industriales TL.pdf | `out/tl-industriales.json` (+ descartes) |
| `soportes_extract.py` | Soportes TL.pdf | `out/tl-soportes.json` (+ descartes) |

Requisitos: Python 3 y `pip install pdfplumber`. Uso: `python -I <script> [ruta-al-pdf]`.

`soportes_extract.py` también usa el texto plano del PDF para las descripciones de serie:
`pdftotext -layout "data/source/Soportes TL.pdf" "scripts/translink/Soportes TL.txt"`.

Notas de la importación de octubre de 2026:
- Industriales: 45 filas que el script marca como `redondeo_metrico_catalogo` (p.ej. TL-Z14,
  Li 375) son correctas en el catálogo (Li métrica nominal, Ld − Li coherente) y se
  añadieron a mano al JSON final. Las erratas (`errata_o_incoherencia`) se dejaron fuera.
- Soportes: en `data/kb/tl-soportes.json` se quitaron los campos internos (avisos, texto del
  PDF) y, en los termoplásticos, la columna BEARING REFERENCE se guarda como
  `unidad_equivalente`, porque el catálogo pone ahí la unidad de fundición equivalente.
