# Cómo corregir o ampliar lo que sabe el chatbot

Guía para el equipo de ESGAS. No hace falta saber programar ni instalar nada:
todo se hace desde el navegador y se publica solo.

---

## 1. ¿De dónde saca el chatbot lo que responde?

De cuatro sitios distintos. Saber cuál es cada uno es lo único que hay que
tener claro, porque **cada uno se corrige en un lugar diferente**:

| Lo que responde | De dónde sale | Quién lo corrige y dónde |
|---|---|---|
| **Conceptos técnicos**: tipos de sellado, juego interno (C3, CN…), jaulas, precisión, sufijos, perfiles de correa | Un **glosario** que hemos preparado con vuestra documentación | **Vosotros**, editando un fichero de texto (apartado 2) |
| **Datos de producto**: equivalencias entre marcas, fichas técnicas, aplicaciones, correas Continental | Los **Excel** que nos pasasteis | Sustituyendo el Excel (apartado 4) |
| **Precio, stock y descuentos** | **PrestaShop**, en tiempo real | En la tienda, como siempre. Aquí no se toca nada |
| **Datos muy concretos que no cubren los anteriores** | Búsqueda en webs oficiales de fabricante | Automático |

**El caso que detectasteis —la diferencia entre dos tipos de sellado— era del
primer grupo.** Antes esa explicación estaba escrita dentro del programa, y
además estaba mal: daba por hecho que `2RS` y `2RZ` eran lo mismo, cuando el
`2RS` es una junta **con** contacto y el `2RZ` es **sin** contacto. Ya está
corregido, y sobre todo: **ahora esa información vive en un fichero que podéis
editar vosotros**, sin depender de nosotros.

Además, el chatbot tiene ahora **prohibido explicar estos conceptos de
memoria**: está obligado a leer el glosario antes de responder. Lo que pongáis
ahí es lo que dirá.

---

## 2. Corregir una explicación que el bot da mal

Es el caso más frecuente y se hace en dos minutos.

1. Entra en el repositorio en GitHub y abre el fichero
   **`data/kb/glosario.json`**.
2. Pulsa el icono del **lápiz** (arriba a la derecha) para editar.
3. Busca el concepto (con `Ctrl+F`) y **corrige el texto que hay dentro de
   `"texto"`**. Escribe en español normal, tan largo como haga falta.
4. Abajo, pulsa **Commit changes**. Explica en una línea qué has cambiado
   (por ejemplo: *"corregida la explicación del sellado 2RZ"*).
5. Listo. En unos minutos el chatbot ya responde con el texto nuevo.

### Cómo es una ficha por dentro

```
{
  "id": "sellado-llb-sin-contacto",
  "categoria": "sellado",
  "prioridad": 9,
  "terminos": ["LLB", "LB", "2RZ", "VV", "sin contacto"],
  "titulo": "LLB / 2RZ / VV — Juntas de goma SIN contacto",
  "texto": "Aquí va la explicación completa...",
  "fuente": "Catálogo NTN + documentación de ESGAS"
}
```

Solo hay dos campos que importan de verdad:

- **`texto`** → es **lo que el bot va a explicar**. Es el que se corrige.
- **`terminos`** → son las palabras con las que el cliente puede preguntarlo.
  Cuantas más pongáis, mejor lo encontrará: el sufijo, sus sinónimos, y cómo lo
  llama la gente en el mostrador.

### Añadir un concepto nuevo

Copia una ficha entera (desde `{` hasta `},`), pégala debajo, cambia el `"id"`
por uno que no se repita y rellena `terminos`, `titulo` y `texto`. No hay que
darla de alta en ningún otro sitio.

### Dos reglas al escribir

- El texto va **entre comillas**, en una sola línea. Para hacer un salto de
  línea, escribe `\n`.
- Si necesitas unas comillas dentro del texto, ponles una barra delante: `\"`.

---

## 3. ¿Y si me equivoco al editar?

**No pasa nada, y no puedes romper el chatbot.** Hay tres redes de seguridad:

1. **Revisión automática.** Cada vez que guardas un cambio en el glosario,
   GitHub lo comprueba solo. Si algo está mal (una coma de más, un campo
   vacío, un `id` repetido) verás un **aspa roja ❌** junto a tu cambio, y al
   pinchar te dice **en castellano** qué falla y cómo arreglarlo. Si sale un
   **tic verde ✅**, el cambio es correcto y ya se está publicando.
2. **Deshacer es un clic.** En GitHub, en el historial de cambios, cualquier
   modificación se revierte con el botón *Revert*. Se vuelve al texto anterior.
3. **El bot nunca se cae por esto.** Si el fichero tuviera un error, el
   chatbot sigue funcionando con normalidad; simplemente no usaría el glosario
   hasta que se corrija.

---

## 4. Actualizar catálogos y documentación (los Excel)

Para lo gordo: equivalencias entre marcas, fichas técnicas, aplicaciones o la
tarifa de correas Continental.

Aquí sí hace falta un paso técnico (regenerar los datos a partir del Excel),
así que **lo más práctico es que nos paséis el Excel nuevo** y lo dejamos
publicado. Es un proceso de cinco minutos y está documentado en
`docs/MANTENIMIENTO-KB.md`, de modo que puede hacerlo cualquier persona con
perfil técnico, no depende de nosotros en exclusiva.

Importante: **el chatbot no coge de ahí ni el precio ni el stock**. Esos salen
siempre de PrestaShop, en vivo.

---

## 5. Resumen

| Quiero… | Qué hago |
|---|---|
| Corregir cómo explica un concepto técnico | Editar `data/kb/glosario.json` en GitHub |
| Añadir un concepto que no conoce | Añadir una ficha en ese mismo fichero |
| Cambiar precios, stock o descuentos | En PrestaShop, como siempre |
| Actualizar equivalencias, fichas o correas | Pasarnos el Excel nuevo |
| Deshacer algo que salió mal | Botón *Revert* en GitHub |

---

## 6. Una recomendación práctica

Cuando detectéis una respuesta que no os convenza, **apuntad la pregunta tal
cual la escribió el cliente y la respuesta que dio el bot**. Con esas dos
frases se localiza el punto exacto a corregir en el glosario en un momento.
Es, con diferencia, la información más útil que nos podéis dar.
