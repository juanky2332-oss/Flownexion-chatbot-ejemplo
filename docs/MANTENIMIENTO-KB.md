# Mantenimiento de la base de conocimiento del chatbot

Este documento responde a una pregunta concreta de ESGAS:

> «Hemos detectado que el chat devuelve mal una información (no explica bien la
> diferencia entre dos tipos de sellado). ¿Cómo se hará para corregirla, y de
> dónde la está recogiendo ahora mismo?»

Está escrito para que cualquiera con acceso al repositorio pueda corregir o
ampliar lo que sabe el bot **sin depender de quien lo programó**.

---

## 1. De dónde saca el bot cada respuesta

El bot **no sabe nada por su cuenta**. Todo lo que responde sale de una de estas
cuatro fuentes, y cada una se corrige de una forma distinta:

| # | Fuente | Qué contiene | Dónde se corrige |
|---|--------|--------------|------------------|
| 1 | **Glosario técnico** | Conceptos: tipos de sellado, juego interno, jaulas, precisión, sufijos, familias de correa | `data/kb/glosario.json` — texto plano, sin tocar código |
| 2 | **Base de datos de producto** | Equivalencias, fichas técnicas, aplicaciones, correas Continental, correas y soportes TL | Los Excel de `data/source/` + `npm run build:kb`; los PDF de Translink con `scripts/translink/` (ver 4 bis) |
| 3 | **Catálogo de la tienda** | Precio, stock, referencias a la venta | PrestaShop (`b2b.esgas.es`) — en vivo, no se toca aquí |
| 4 | **Búsqueda en webs oficiales** | Solo lo que no cubren 1 y 2 | Automático, restringido a dominios de fabricante (NTN-SNR, Translink, Sedis, Bondioli, INA/FAG, SKF, Aignep) |

**El caso que detectasteis (el sellado) era de la fuente 1.** Antes, esas
explicaciones estaban escritas dentro del código, en una sola línea que agrupaba
mal los sufijos: daba por hecho que `LLU`, `2RS` y `2RZ` eran todos juntas *de
contacto*, cuando el `2RZ` es una junta **sin** contacto. Por eso el bot
explicaba mal la diferencia.

Ahora esas explicaciones viven en `data/kb/glosario.json`, un fichero de texto
pensado para que lo edite una persona, y el bot tiene **prohibido explicar estos
conceptos de memoria**: está obligado a leer el glosario antes de responder.

---

## 2. Corregir una explicación técnica equivocada

Es el caso más frecuente y el más sencillo. **No hace falta tocar código.**

1. Abre `data/kb/glosario.json`.
2. Busca la entrada por su `titulo` o por alguno de sus `terminos`.
3. Corrige el campo `texto`. Escribe en español normal, con la extensión que
   haga falta: el bot lo reformula, pero no puede contradecirlo.
4. Si conviene, actualiza también `fuente` (de dónde sale el dato) y sube
   `version` a la fecha del cambio.
5. Guarda, súbelo (apartado 5) y listo.

### Estructura de una entrada

```jsonc
{
  "id": "sellado-llb-sin-contacto",     // identificador único, no se repite
  "categoria": "sellado",               // sellado | juego | jaula | precision | sufijos | correas
  "prioridad": 9,                       // a más alto, antes se muestra ante empate
  "terminos": ["LLB", "LB", "2RZ", "VV", "sin contacto"],
  "titulo": "LLB / 2RZ / VV — Juntas de goma SIN contacto",
  "texto": "Explicación completa...",   // ESTO es lo que lee el bot
  "fuente": "Catálogo NTN + doc. del cliente"
}
```

**Sobre `terminos`:** son las palabras que hacen que el bot encuentre la entrada.
Conviene incluir todas las formas en que un cliente puede preguntarlo (el sufijo,
sus sinónimos, cómo lo llama la gente en el mostrador). Las palabras sueltas se
buscan como palabra completa —«Z» no salta con cualquier palabra que lleve una
z— y las expresiones de varias palabras se buscan tal cual.

### Añadir un concepto nuevo

Copia una entrada existente, cambia el `id` (que no se repita) y rellena
`terminos`, `titulo` y `texto`. No hay que registrarla en ningún sitio más: el
bot recorre el fichero entero.

### Comprobar que ha funcionado

```bash
npm run test:kb
```

Ese comando pregunta al KB lo mismo que preguntaría un cliente y verifica las
respuestas. Si has tocado algo del sellado, añade tu caso a
`scripts/test-kb.ts` para que quede cubierto de aquí en adelante.

---

## 3. Añadir o actualizar documentación de producto (Excel)

Para catálogos completos: equivalencias entre marcas, fichas técnicas,
aplicaciones, tarifas de correas.

1. Deja el `.xlsx` en `data/source/` con **el mismo nombre** que el que sustituye.
   Los reconocidos ahora mismo son:
   - `Equivalencias entre productos.xlsx`
   - `Informacion tecnica NTN.xlsx`
   - `Tipos de aplicaciones.xlsx`
   - `Reglas de precio del catálogo (1).xlsx`
   - `CORREAS CONTINENTAL.xlsx`
2. Ejecuta:
   ```bash
   npm run build:kb
   ```
   Esto regenera los ficheros de `data/kb/` (`eq-*.json`, `tech-*.json`,
   `ap-*.json`, `belts-*.json`, `precios.json`).
3. Comprueba con `npm run test:kb`.
4. Súbelo (apartado 5).

> Los `.xlsx` de `data/source/` **no se suben al repositorio** (pesan mucho y son
> documentación interna). Lo que sí se sube es el resultado, los `.json` de
> `data/kb/`. Guarda siempre los Excel originales en la carpeta de
> documentación del proyecto.

**Si el Excel nuevo tiene una estructura distinta** (otras columnas, otro
formato), sí hace falta un ajuste en `scripts/build-kb.ts`. Es el único caso de
esta guía que requiere a alguien técnico.

---

## 4. Qué pasa con las correas Continental

Se importan de la tarifa oficial del fabricante. Del Excel se usan, según indicó
ESGAS, la columna **D** (descripción y longitud), la **M** (nombre) y la **N**
(peso), más el **tipo de correa**, que no está en ninguna columna: es la cabecera
que hay encima de cada grupo dentro de cada pestaña.

**El precio de la tarifa de Continental NO se importa a propósito.** Son precios
de lista del fabricante, no los de venta de ESGAS. El precio y el stock que ve el
cliente salen siempre de PrestaShop. Meter aquí un precio distinto sería la vía
más rápida a que el bot cotice mal.

Lo que el bot sí dice de esta fuente es si una correa, **en Continental**, es de
stock, bajo pedido o está descatalogada — y tiene instrucciones explícitas de no
presentarlo como si fuera el stock de ESGAS.

---

## 4 bis. Catálogos técnicos de Translink (TL) — octubre 2026

ESGAS pasó tres catálogos en PDF de Translink. De cada uno se importan
**exactamente** los datos que pidió:

| Catálogo | Datos | Fichero del KB |
|----------|-------|----------------|
| Correas dentadas TL | Nº de dientes (NO. TEETH) y desarrollo (PITCH LENGTH) | `data/kb/tl-dentadas.json` |
| Correas industriales TL | Longitud interior (INSIDE LENGTH) y de paso (DATUM LENGTH) | `data/kb/tl-industriales.json` |
| Soportes TL | Ø de eje, medidas, rosca, cuerpo, rodamiento y peso | `data/kb/tl-soportes.json` |

Los PDF no son tablas limpias: se leen por coordenadas con los scripts de
`scripts/translink/` (Python + pdfplumber) y **cada fila se valida antes de
entrar**: en las dentadas, dientes × paso tiene que dar el desarrollo impreso; en
las trapeciales, la diferencia Ld − Li tiene que ser la propia del perfil; en los
soportes, el rodamiento y el cuerpo tienen que cuadrar con la unidad y con el Ø
de eje. Las filas con erratas del propio catálogo (p. ej. TL-817L-217, la serie
AT10 cuya columna de desarrollo repite los dientes, o unas BX con la referencia
impresa en lugar de la Ld) **se dejaron fuera a propósito**: con ellas el bot
contestaría un dato equivocado. Para esas referencias el bot recurre a
Continental, a la página o a la búsqueda oficial.

El bot busca correas TL con la misma herramienta que las Continental
(`find_belt`, que devuelve las dos marcas) y la ficha de un soporte TL con
`get_technical_info`, igual que la de un rodamiento NTN/SNR.

Si Translink publica una versión nueva de un catálogo: copiar el PDF a
`data/source/`, cambiar la ruta `PDF` al principio del script correspondiente,
ejecutarlo y copiar el JSON resultante a `data/kb/`. Después, `npm run verify`.

---

## 4 ter. Webs de consulta añadidas (octubre 2026)

Además de NTN-SNR, Translink, Sedis y Bondioli, la búsqueda en fuentes oficiales
consulta ahora los catálogos técnicos de **INA/FAG** (medias.schaeffler.es),
**SKF** (skf.com) y **Aignep** (aignep.com, neumática). Están en
`lib/websearch.ts` (`OFFICIAL_DOMAINS` y `CATALOGOS_POR_MARCA`); para añadir otra
web basta con sumarla a esas dos listas.

---

## 4 quater. Ficha técnica en PDF

Cuando el bot da la información técnica completa de un producto, debajo de la
tarjeta aparece **«Descargar en formato PDF»**. El PDF sigue la maqueta que pasó
ESGAS (logo, ficha del producto, resumen de la referencia, información técnica
completa y la cláusula de responsabilidad al pie) y lleva **exactamente lo que el
cliente acaba de leer en el chat**, sin precio ni stock. Se genera en el propio
navegador del cliente: no se guarda en ningún servidor.

- Qué entra en el PDF: `lib/ficha.ts` (lee la respuesta del bot).
- Cómo se maqueta: `lib/fichaPdf.ts` (logo en `public/esgas-logo-ficha.png`,
  texto del aviso legal en la constante `AVISO_LEGAL`).
- Si el bot cambiara el formato de sus fichas y el botón dejase de salir, las
  pruebas de `npm run test:kb` lo detectan con respuestas reales guardadas en
  `scripts/fixtures/`.

---

## 5. Publicar los cambios

El despliegue es automático: al subir a la rama `main`, Vercel reconstruye y
publica en unos minutos.

```bash
git add data/kb/ docs/            # y lo que hayas tocado
git commit -m "kb: corregir explicación de los sellados sin contacto"
git push
```

Antes de subir, conviene pasar:

```bash
npm run test:kb      # el KB responde lo correcto
npm run build        # el proyecto compila
```

---

## 6. Cómo se protege el bot de volver a equivocarse

Tres capas, de menos a más fuerte:

1. **El prompt se lo prohíbe.** La sección «CONCEPTOS TÉCNICOS — NUNCA LOS
   EXPLIQUES DE MEMORIA» le obliga a consultar el glosario antes de explicar
   sellado, juego, jaulas, precisión, sufijos o perfiles de correa.
2. **El glosario se le inyecta solo.** Cuando el mensaje del cliente contiene una
   pregunta conceptual o un sufijo técnico, el sistema busca en el glosario
   **por código**, antes de que intervenga la IA, y le entrega el texto verificado
   ya resuelto. Así la respuesta correcta no depende de que decida consultarlo.
3. **Hay pruebas automáticas.** `npm run test:kb` comprueba, contra los datos
   reales, que el `2RZ` sale como junta *sin* contacto, que el `ZZ` sale como
   deflector metálico y que se advierte de que no es estanco, entre otros casos.

Aun así, **si detectáis otra explicación equivocada, la vía es siempre la misma:
corregir el texto en `data/kb/glosario.json`**. Es intencionado que sea así de
simple: el conocimiento técnico lo tiene ESGAS, y debe poder corregirlo sin
esperar a nadie.

---

## 7. Resumen rápido

| Quiero... | Hago... |
|-----------|---------|
| Corregir cómo explica un concepto | Editar `data/kb/glosario.json` |
| Añadir un concepto nuevo | Añadir una entrada a `data/kb/glosario.json` |
| Actualizar equivalencias / fichas / correas | Reemplazar el `.xlsx` en `data/source/` + `npm run build:kb` |
| Cambiar precios o stock | En PrestaShop, no aquí |
| Cambiar el tono o las reglas de venta | `lib/agent.ts` (requiere perfil técnico) |
| Publicar los cambios | `git push` a `main` |
