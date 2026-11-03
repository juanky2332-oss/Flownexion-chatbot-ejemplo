// MAPA DEL CATÁLOGO DE LA PÁGINA — qué TIPOS de producto vende ESGAS.
//
// Por qué existe (feedback real del cliente, 03-11-2026): "¿tenéis soportes de
// fundición?" → "no tenemos soportes de fundición"; "¿qué soportes tenéis?" →
// "no tenemos soportes de ningún tipo". En la página hay más de 300 soportes.
// Causas:
//   1. search_products buscaba el texto LITERAL ("soportes de fundición") y la
//      tienda los llama "SOPORTE FUNDICION TL UCF 204": plural, "de" y tilde →
//      cero resultados → "no lo tenemos".
//   2. Muchos productos ni siquiera llevan el nombre de su familia: los
//      soportes SNR se llaman "SNR UCP 205", los rodamientos "NTN 22205 EA W33".
//      Ninguna búsqueda por palabras los encuentra.
//
// Aquí se clasifica CADA artículo del catálogo en su familia y tipo a partir de
// su nombre, y se reconoce cuándo el cliente pregunta por una familia. La
// consulta se resuelve en código (lib/agent.ts) y se le pasa al modelo como
// dato verificado — mismo patrón que equivalencias, glosario y correas.
//
// Solo lógica pura (sin red) para poder probarla en npm run test:kb.

export interface TipoFamilia {
  id: string;
  nombre: string;
  /** Sobre el nombre del producto, en mayúsculas y sin tildes. */
  re: RegExp;
  /** Explicación breve y verificable para el cliente (opcional). */
  explicacion?: string;
  /** Sobre el mensaje del cliente (minúsculas, sin tildes): pide este tipo. */
  pide?: RegExp;
}

export interface Familia {
  id: string;
  /** En plural, como se lo diríamos al cliente. */
  nombre: string;
  /** El mensaje del cliente habla de esta familia (minúsculas, sin tildes). */
  detectar: RegExp;
  /** El producto pertenece a la familia (nombre en mayúsculas y sin tildes). */
  incluye: RegExp;
  /** Se descarta aunque case con `incluye`. */
  excluye?: RegExp;
  /** Cómo se organiza la familia, para orientar al cliente. */
  explicacion: string;
  /** Qué preguntar para afinar (UNA sola cosa). */
  afinar: string;
  tipos: TipoFamilia[];
}

export const sinTildes = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const mayus = (s: string) => sinTildes(s).toUpperCase().replace(/\s+/g, " ").trim();
const minus = (s: string) => sinTildes(s).toLowerCase();

// Prefijo de un soporte/unidad: inserto (UC, UK, US, ES, EX, SUC…) + forma del cuerpo.
const SOPORTE_SNR =
  /^(?:NTN|SNR|TL|FAG|INA)\s+(?:M?S?U[CKS]|E[SX]|C?ES|SU?C?|U)?(?:P|PA|PAE|PE|PF|PFL|F|FA|FB|FC|FCE|FD|FE|FL|FLE|FS|FT|T|EHE|SP|SPA|SF|SFL|ST|SN|SNC|SNL|SCO|SCC|SC)[.\s]?\d/;

/** Forma del cuerpo del soporte a partir de la designación (UCP, UCFL, ESFD…). */
function formaSoporte(n: string): string | null {
  if (/\bSN[CL]?\s?\d|\bPARTIDO\b/.test(n)) return "partido";
  if (/\bSC[OC]?\s?\d|\bTAPA\b/.test(n)) return "tapa";
  // Designación = letras pegadas a la serie de 3 cifras ("UCFL 205", "SUCP.208", "ESFD 202").
  const m = n.match(/\b([A-Z]{1,7})[.\s]?\d{3}(?!\d)/);
  if (!m) return null;
  let c = m[1].replace(/^M(?=U)/, "");
  const prefijo = c.match(/^(SUC|SU|UC|UK|US|ES|EX|CES|S)/)?.[1];
  if (prefijo) c = c.slice(prefijo.length);
  if (!c) return null; // inserto sin cuerpo (UC 205, ES 204…)
  if (/^S(P|PA|F|FL|FC|T)$/.test(c)) c = c.slice(1); // cuerpo inoxidable (UCSP, SP 205…)
  if (c === "P" || c === "PE") return "pie";
  if (c === "PA" || c === "PAE") return "pie-alto";
  if (c === "F" || c === "FS") return "brida-cuadrada";
  if (c === "FL" || c === "FLE" || c === "FD") return "brida-oval";
  if (c === "FC" || c === "FCE") return "brida-redonda";
  if (c === "FB" || c === "FT" || c === "FE" || c === "FA") return "brida-3";
  if (c === "T") return "tensor";
  if (c === "EHE") return "colgante";
  if (c === "PF" || c === "PFL") return "chapa";
  return null;
}

export const FAMILIAS: Familia[] = [
  // ───────────────────────────── SOPORTES ─────────────────────────────
  {
    id: "soportes",
    nombre: "soportes con rodamiento (chumaceras)",
    detectar: /\bsoportes?\b|\bchumacer|\bucp\b|\bucf\b|\bucfl\b|\bucfc\b|\buct\b|\bucpa\b|\bsoporte partido|\bsn[lc]\b/,
    incluye: new RegExp(
      "^SOPORTE (FUNDICION|INOX|PARTIDO|TERMOPLASTICO)|^SOPORTE TERMOPLASTICO SNR|" + SOPORTE_SNR.source
    ),
    excluye: /AIGNEP|CILINDRO|SENSOR|CHARNELA|FIJACION|\bFILTRO\b|\bSSN\b/,
    explicacion:
      "Un soporte lleva un rodamiento inserto (serie UC2xx) dentro de un cuerpo. Se elige por: (1) la FORMA del cuerpo — de pie (UCP), brida cuadrada de 4 agujeros (UCF), brida oval de 2 agujeros (UCFL), brida redonda (UCFC), tensor (UCT), partido (SNL/SNC, para rodamientos de rótula con manguito); (2) el MATERIAL — fundición (el estándar), inoxidable o termoplástico con rodamiento inox (alimentaria, humedad, lavados); (3) el EJE — la cifra 2xx: las dos últimas × 5 = diámetro del eje (205 = 25 mm, 206 = 30 mm, 208 = 40 mm).",
    afinar: "el diámetro del eje (o la serie: 204, 205, 206…) y si va sobre base horizontal (de pie) o contra una pared (brida)",
    tipos: [
      { id: "termoplastico", nombre: "termoplásticos (con rodamiento inox o cromo)", re: /TERMOPLASTICO|PLAS/, pide: /termoplastic|plastic|polimer|alimentari/ },
      { id: "partido", nombre: "partidos (SNL / SNC)", re: /PARTIDO|\bSN[CL]?\s?\d/, pide: /partid|\bsn[lc]\b|\bsn\b/ },
      { id: "tapa", nombre: "accesorios para soporte partido (juntas y tapas)", re: /\bSC[OC]?\s?\d|\bTAPA\b/, pide: /\btapas?\b|\bjuntas? (para|de) soporte/ },
      { id: "cuerpo", nombre: "cuerpos de soporte sin rodamiento (F, FL, P, T, SP inox…)", re: /^SNR (S?(P|PA|F|FL|FC|FCE|T)|PF)\s?\d/, pide: /\bcuerpos?\b|sin rodamiento|solo (el )?soporte|alojamiento/ },
      { id: "inox", nombre: "inoxidables", re: /INOX|^(NTN|SNR) S(UC|P|F|FL|PA|T)\b|^SNR SUC/, pide: /\binox|inoxidable|acero inox|alimentari|humed|lavad/ },
      { id: "chapa", nombre: "de chapa de acero", re: /^SNR (US)?PFL?\s?\d/, pide: /\bchapa\b/ },
      { id: "fundicion", nombre: "de fundición", re: /FUNDICION|^(NTN|SNR) (UC|UK|ES|EX|US)(P|F|FL|FC|T|PA|FA|FB|FE|FCE|PE|PAE|FLE|FD|EHE)\b/, pide: /fundicion|hierro fundido|\bgris\b/ },
    ],
  },

  // ───────────── MANGUITOS, TUERCAS Y ACCESORIOS DE MONTAJE ────────────
  {
    id: "accesorios-montaje",
    nombre: "accesorios de montaje de rodamientos (manguitos, tuercas, arandelas, tapas)",
    detectar: /\bmanguitos? de (fijacion|montaje|desmontaje)|\btuercas? de fijacion|\barandelas? de (fijacion|seguridad)|\btapas? ciegas?|\banillos? de (fijacion|retencion)/,
    incluye: /^MANGUITO MONTAJE|MANGUITO DESMONTAJE|TUERCA FIJ|ARANDELA \d|^SNR (HM|MB|MS|AOH)\b|^TAPA CIEGA|^SNR ANILLO/,
    explicacion:
      "Piezas para montar rodamientos en el eje y cerrar soportes: manguitos de fijación (H) y de desmontaje (AOH), tuercas (KM/HM) y arandelas de seguridad (MB/MS), anillos de fijación (FR) y tapas ciegas para soportes.",
    afinar: "la referencia del rodamiento o del soporte en el que va",
    tipos: [
      { id: "manguito", nombre: "manguitos de fijación (H) y de desmontaje (AOH)", re: /MANGUITO/, pide: /manguito/ },
      { id: "tuerca", nombre: "tuercas y arandelas de fijación", re: /TUERCA|ARANDELA|^SNR (HM|MB|MS)\b/, pide: /tuerca|arandela/ },
      { id: "anillo", nombre: "anillos de fijación", re: /ANILLO/, pide: /anillo/ },
      { id: "tapa-ciega", nombre: "tapas ciegas para soporte", re: /TAPA CIEGA/, pide: /tapas?\b/ },
    ],
  },

  // ──────────────────────────── RODAMIENTOS ───────────────────────────
  {
    id: "rodamientos",
    nombre: "rodamientos",
    detectar: /\brodamientos?\b|\bcojinetes?\b|\bbaleros?\b|\brulemanes?\b/,
    incluye: /^(NTN|SNR|FAG|INA|TL|NSK|SKF)\b|^RODAMIENTO\b/,
    excluye: /SOPORTE/,
    explicacion:
      "Los rodamientos se eligen por el TIPO (según la carga y el montaje) y por las MEDIDAS (eje × exterior × ancho). Tipos: rígidos de bolas (60xx, 62xx, 63xx… los más comunes), de contacto angular (72xx B, 32xx/33xx de doble hilera), autoalineables de bolas (12xx, 13xx), de rodillos cónicos (302xx, 320xx, 4T-…), de rodillos cilíndricos (NU, NJ, NUP, N), oscilantes de rodillos a rótula (222xx, 223xx, 230xx…), axiales (511xx, 512xx, 811xx, 29xxx), de agujas (NK, HK, NA, RNA), rodillos de leva (KR, NATR, NUTR) y lineales (BBE, LSE). Además, rodamientos de inserción para soporte (UC, UK, ES, EX).",
    afinar: "la referencia que lleva grabada, o las medidas (eje × exterior × ancho)",
    tipos: [
      { id: "insercion", nombre: "de inserción para soporte (UC, UK, ES, EX, US)", re: /^(NTN|SNR|TL|RODAMIENTO( CROMO)? TL) (M?S?U[CKS]|E[SX]|C?ES|SUC|SB)\s?\d/, pide: /insercion|inserto|\buc\s?\d|\buk\s?\d|\bes\s?2\d\d|\bex\s?2\d\d/ },
      { id: "cilindricos", nombre: "de rodillos cilíndricos (NU, NJ, NUP, N)", re: /\b(NU|NJ|NUP|NF|NN|N)\s?\d{3,4}|\bSL\d/, pide: /cilindric|\bnu\b|\bnj\b|\bnup\b/ },
      { id: "agujas", nombre: "de agujas (NK, HK, NA, RNA, casquillos)", re: /\b(NK|NKS|NKX|HK|NA|RNA|RNAB|K\d|1R|BK|7E-HK)\s?\d/, pide: /agujas?/ },
      { id: "leva", nombre: "rodillos de leva y seguidores (KR, NATR, NATV, NUTR, NUKR)", re: /\b(KR|NATR|NATV|NUTR|NUKR)\s?\d/, pide: /leva|seguidor|rodillo guia|rodillos de apoyo/ },
      { id: "lineales", nombre: "lineales (BBE, BBER, LSE, KH)", re: /\b(BBE|BBER|BBERS|BBERMS|LSE|LSET|KH)\s?\d/, pide: /lineal|casquillo de bolas/ },
      { id: "axiales", nombre: "axiales (511xx, 512xx, 513xx, 811xx, 29xxx, AXK)", re: /\b5[1-4]\d{3}\b|\bK?8[19]\d{3}|\b29[234]\d{2}|\bAXK\b|\bAS\s?\d|\bWS\s?8|ZARF/, pide: /axial|empuje|de empuje/ },
      { id: "conicos", nombre: "de rodillos cónicos (302xx, 303xx, 320xx, 322xx, 330xx, 4T-…)", re: /\b4T-|\bET-|\b3(0[23]|1[23]|2[0-39]|3[0-2])\d{2}|\b30[23]\/\d|\b32[0-3]\/\d|\b\d{4,6}\/\d{4,6}\b/, pide: /conicos?|rodillos conicos|de cono/ },
      { id: "rotula-rodillos", nombre: "oscilantes de rodillos a rótula (222xx, 223xx, 230xx, 231xx, 240xx…)", re: /\b(10X\s?)?2(1[23]|2[23]|3[0-2]|4[01])\d{2}(?!\d)/, pide: /rotula|oscilante|esferic|a rotula/ },
      { id: "contacto-angular", nombre: "de contacto angular (72xx B, 73xx B, 32xx/33xx, 52xx/53xx)", re: /\b7[234]\d{2}\s?B|\b(32|33|52|53)\d{2}\b(?!\d)/, pide: /contacto angular|angular/ },
      { id: "autoalineable-bolas", nombre: "autoalineables de bolas (12xx, 13xx, 22xx, 23xx)", re: /\b(1[23]|2[23])\d{2}(?!\d|\/)/, pide: /autoalineable|rotula de bolas|bolas a rotula/ },
      { id: "rigido-bolas", nombre: "rígidos de bolas (60xx, 62xx, 63xx, 68xx, 69xx…)", re: /\b(42\d{2}|6[0-4]\d{2}|6[89]\d{2}|16\d{3}|61[89]\d{2}|62[23]\d{2}|630\d{2}|6\d{1,2}|62\d\/\d+|63\d\/\d+|60\/\d+|SSN\s?\d+)\b/, pide: /rigidos? de bolas|de bolas\b|una hilera de bolas/ },
    ],
  },

  // ───────────────────────────── CORREAS ──────────────────────────────
  {
    id: "correas",
    nombre: "correas",
    detectar: /\bcorreas?\b/,
    incluye: /^CORREA\b/,
    explicacion:
      "Las correas se eligen por el PERFIL (la forma de la sección o el paso del diente) y la LONGITUD. Familias: trapeciales clásicas (Z, A, B, C, D — p. ej. A48), trapeciales estrechas (SPZ, SPA, SPB, SPC), dentadas o síncronas (HTD 3M/5M/8M/14M, T5/T10, AT10, XL/L/H), dentadas por fuera (AX, BX, XPZ… flancos dentados, más flexibles) y Poly-V o multicostilla (PJ, PK, PL). Marcas: Continental y TL (Translink).",
    afinar: "el perfil y la longitud que lleva marcados (p. ej. A 1250, SPZ 1000, 600-8M-30)",
    tipos: [
      { id: "trapecial", nombre: "trapeciales clásicas (Z, A, B, C, D)", re: /^CORREA (TL PRO SERIES |CONTINENTAL )?(Z|A|B|C|D|E)\s?\d/, pide: /trapecial|trapezoidal|clasica|en v\b/ },
      { id: "estrecha", nombre: "trapeciales estrechas (SPZ, SPA, SPB, SPC)", re: /\bSP[ZABC]\s?-?\d|\bXP[ZABC]|\b3V|\b5V/, pide: /estrecha|\bsp[zabc]\b/ },
      { id: "dentada", nombre: "dentadas o síncronas (HTD 3M/5M/8M/14M, T5, T10, AT10, XL, L, H)", re: /\b\d+(M|-\d+M)\b|\b(H|S)?\d+M\b|\b(AT|T)\d+\b|\b\d+\s?(XL|L|H)\b|DENTADA|\b\d+(3M|5M|8M|14M)/, pide: /dentad|sincron|\bhtd\b|\b[358]m\b|\b14m\b|\bat10\b|\bt10\b|\bt5\b/ },
      { id: "dentada-flancos", nombre: "trapeciales con flancos dentados (AX, BX, CX, AVX, XPZ…)", re: /\b(ZX|AX|BX|CX|AVX|XP[ZABC])\s?\d/, pide: /flancos? dentad|dentada trapecial|\bzx\b|\bax\b|\bbx\b|\bavx\b/ },
      { id: "polyv", nombre: "Poly-V o multicostilla (PJ, PK, PL)", re: /\bP[JKLM]\s?\d|\d+\s?P[JKLM]\b|POLY/, pide: /poly|multicostilla|acanalada|\bp[jkl]\b/ },
    ],
  },

  // ───────────────────────────── RETENES ──────────────────────────────
  {
    id: "retenes",
    nombre: "retenes",
    detectar: /\breten(es)?\b|\bsimmering|\bjuntas? de eje/,
    incluye: /^RETEN\b|^TAPON RETEN/,
    explicacion:
      "Los retenes radiales se designan por sus medidas: eje × alojamiento × ancho (p. ej. 25x40x7). Se eligen por el MATERIAL — NBR (nitrilo, el estándar, hasta unos 100 °C) o Vitón/FKM (alta temperatura y química) — y por el TIPO: con muelle, doble labio (con guardapolvo), con exterior metálico. También hay tapones ciegos para cerrar alojamientos.",
    afinar: "las tres medidas (eje × alojamiento × ancho) y si lo necesita en NBR o en Vitón",
    tipos: [
      { id: "nbr", nombre: "de NBR (nitrilo)", re: /^RETEN DL \d|^RETEN DL\b(?!.*VITON)/, pide: /\bnbr\b|nitrilo|goma normal/ },
      { id: "viton", nombre: "de Vitón / FKM (alta temperatura)", re: /VITON|FKM/, pide: /viton|fkm|alta temperatura/ },
      { id: "metalico", nombre: "con exterior metálico", re: /METALICO/, pide: /metalic/ },
      { id: "espejo", nombre: "espejo (TL)", re: /ESPEJO/, pide: /espejo/ },
      { id: "tapon", nombre: "tapones ciegos", re: /^TAPON RETEN/, pide: /tapon|ciego/ },
    ],
  },

  // ───────────────────────────── CADENAS ──────────────────────────────
  {
    id: "cadenas",
    nombre: "cadenas de rodillos y sus uniones",
    detectar: /\bcadenas?\b|\beslabon|\bcandado de cadena|\bunion de cadena/,
    incluye: /^CADENA\b|^UNION \d{2}B/,
    explicacion:
      "Cadenas de rodillos de serie europea (ISO 606, designación B: 06B = 3/8\", 08B = 1/2\", 10B = 5/8\", 12B = 3/4\", 16B = 1\"). El número tras la B indica las hileras: 1 simple, 2 doble, 3 triple. Cada unidad de cadena es un tramo de 5 m. Hay también eslabones de unión (rectos y acodados).",
    afinar: "el paso (06B, 08B, 10B…) y si es simple, doble o triple",
    tipos: [
      { id: "simple", nombre: "simples", re: /^CADENA \d{2}B1/, pide: /simple/ },
      { id: "doble", nombre: "dobles", re: /^CADENA \d{2}B2/, pide: /doble/ },
      { id: "triple", nombre: "triples", re: /^CADENA \d{2}B3/, pide: /triple/ },
      { id: "union", nombre: "eslabones de unión (rectos y acodados)", re: /^UNION \d{2}B/, pide: /union|eslabon|candado|acodad/ },
    ],
  },

  // ─────────────────────────── TAPER LOCK ─────────────────────────────
  {
    id: "taper",
    nombre: "casquillos cónicos Taper Lock",
    detectar: /\btaper\b|\btaperlock\b|\bcasquillos? conicos?\b/,
    incluye: /^TAPER\b/,
    explicacion:
      "El casquillo Taper Lock se designa por su tamaño (1008, 1108, 1210, 1610, 1615, 2012, 2517, 3020, 3525, 3535) y el diámetro del EJE que monta. Cada tamaño admite una gama de ejes.",
    afinar: "el tamaño del casquillo (1610, 2012…) y el diámetro del eje",
    tipos: [],
  },

  // ───────────────────────────── BONDIOLI ─────────────────────────────
  {
    id: "bondioli",
    nombre: "transmisiones Bondioli (cardanes) y sus recambios",
    detectar: /\bbondioli\b|\bcardan(es)?\b|\btoma de fuerza\b|\bcrucetas?\b|\bhorquillas? (de cardan|bondioli)|\blimitador(es)? de par|\brueda libre/,
    incluye: /BONDIOLI|^EMBRAGUE FV|^GATILLO \d|^NUDO SIMPLE/,
    explicacion:
      "Transmisiones cardán Bondioli por SERIE (G1, G2, G4, G5, G7, G8, G9, homocinéticas) y sus recambios: crucetas, horquillas (de tubo, de pulsador, automáticas, rápidas), tubos macho y hembra, protecciones, limitadores de par, ruedas libres, nudos y ferodos.",
    afinar: "la serie de la transmisión (G1, G2, G4…) y qué pieza necesita",
    tipos: [
      { id: "transmision", nombre: "transmisiones completas", re: /^TRANSMISION/, pide: /transmision|cardan completo/ },
      { id: "cruceta", nombre: "crucetas", re: /^CRUCETA/, pide: /cruceta/ },
      { id: "horquilla", nombre: "horquillas", re: /^HORQUILLA BONDIOLI/, pide: /horquilla/ },
      { id: "tubo", nombre: "tubos macho y hembra", re: /^TUBO BONDIOLI/, pide: /\btubos?\b/ },
      { id: "proteccion", nombre: "protecciones", re: /^PROTECCION BONDIOLI/, pide: /proteccion/ },
      { id: "limitador", nombre: "limitadores de par", re: /^LIMITADOR|^EMBRAGUE|^FERODO/, pide: /limitador|embrague|ferodo/ },
      { id: "rueda-libre", nombre: "ruedas libres", re: /^RUEDA LIBRE/, pide: /rueda libre/ },
      { id: "nudo", nombre: "nudos y cardanes simples", re: /^NUDO/, pide: /nudo|homocinetic/ },
    ],
  },

  // ───────────────────────────── NEUMÁTICA ────────────────────────────
  {
    id: "neumatica",
    nombre: "neumática (Aignep y otras)",
    detectar:
      /\bneumatic|\baignep\b|\bracor(es)?\b|\bcilindros? (neumatic|aignep)|\bcilindros?\b(?!.*rodill)|\belectrovalvulas?\b|\bvalvulas?\b|\bfiltros?\b|\bregulador(es)?\b|\blubricador|\bfrl\b|\benchufes? rapid|\benchufes?\b|\btubo (de )?(poliamida|poliuretano|neumatic|aire)|\bespiral|\bpistolas? de aire|\bsopla|\bsilenciador|\bmanometro|\bbobinas?\b|\bpresostato|\brotulas?\b|\bcharnela/,
    incluye:
      /AIGNEP|AIGENP|NEUMATIC|^R?COR\b|^RACOR|^CODO|^TE\b|^MACHON|^REDUCCION|^PROLONGACION|^BICONO|^ESPIGA|^ADAPT?A?T?DOR|^ADAPATDOR|^TAPON (ROJO|CILINDRO|MACHO)|^TAPÓN|^TAPON NEUMATICO|^DERIVACION|^PASAMUROS|^PASATABIQUES|^DISTRIBUIDOR|^REGLETA|^BASE\b|^MULTITUBO|^CILINDRO|^VCP\b|^HORQUILLA (FC|CILINDRO)|^ROTULA|^CHARNELA|^PERNO|^ARTICULACION|^BRIDA VFL|^SOPORTE (CILINDRO|AIGNEP|DE FIJACION|FIJACION)|^CONTRA SOPORTE|^TUERCA|^KIT\b|^UNIDAD DE GUIADO|^AMORTIGUADOR|^SENSOR|^PISTON|^VALV|^MICROVALVULA|^PULSADOR|^ELECTROV|^EV\.|^BOBINA|^CONECTOR|^FILTRO|^REGULADOR|^LUBRICADOR|^MANOMETRO|^GRUPO (DE UNION|TAZA)|^PURGA|^MEMBRANA|^PRESOSTATO|^MULTIPLICADOR|^TUBO (?!BONDIOLI)|^ESPIRAL|^TUBERIA|^ENCHUFE|^PROTECTOR ENCHUFE|^PISTOLA|^BOQUILLA|^PEINE|^SILENCIADOR|^CORTATUBOS|^CUCHILLA|^MALETIN|^ACEITE|^UNION (?!\d{2}B)|^ORIENTABLE|^RECTO CONICO|^REFUERZO|^MANGUITO (NEUMATICO|REDUCCION|AIGNEP)|^TS \d|^MUELLE ANTENA|^INTERFACE|^PLAQUETA|^TEMPORIZADOR|^EJE AIGNEP|^PINZA/,
    excluye: /BONDIOLI|^CORREA|^RETEN/,
    explicacion:
      "Gama de neumática (sobre todo Aignep): racores y conexiones (rectos, codos, tes, machones, reducciones, espigas, adaptadores), tubo de poliamida y poliuretano, cilindros (ISO, compactos, minicilindros) con sus accesorios (horquillas, rótulas, charnelas, sensores), válvulas y electroválvulas (2/2, 3/2, 5/2, 5/3) con bobinas y conectores, tratamiento de aire (filtros, reguladores, lubricadores, manómetros), enchufes rápidos, reguladores de caudal, pistolas de soplado y silenciadores.",
    afinar: "qué pieza es y su medida (diámetro de tubo, rosca 1/8\"…1/2\", diámetro y carrera del cilindro)",
    tipos: [
      { id: "racores", nombre: "racores y conexiones", re: /^R?COR|^RACOR|^CODO|^TE\b|^MACHON|^REDUCCION|^PROLONGACION|^BICONO|^ESPIGA|^ADAPT|^ADAPATDOR|^TAPON|^TAPÓN|^DERIVACION|^PASAMUROS|^PASATABIQUES|^DISTRIBUIDOR|^REGLETA|^BASE\b|^UNION|^ORIENTABLE|^RECTO CONICO|^REFUERZO|^MANGUITO|^MULTITUBO/, pide: /racor|codo|conexion|machon|reduccion|espiga|adaptador|\bte\b/ },
      { id: "tubo", nombre: "tubo (poliamida, poliuretano, espiral)", re: /^TUBO|^ESPIRAL|^TUBERIA/, pide: /\btubos?\b|espiral|tuberia|manguera/ },
      { id: "cilindros", nombre: "cilindros y sus accesorios", re: /^CILINDRO|^VCP|^HORQUILLA|^ROTULA|^CHARNELA|^PERNO|^ARTICULACION|^BRIDA|^SOPORTE|^CONTRA SOPORTE|^TUERCA|^KIT|^UNIDAD DE GUIADO|^AMORTIGUADOR|^SENSOR|^PISTON|^TS \d|^EJE/, pide: /cilindro|vastago|piston|rotula|charnela|sensor/ },
      { id: "valvulas", nombre: "válvulas y electroválvulas (con bobinas y conectores)", re: /^VALV|^MICROVALVULA|^PULSADOR|^ELECTROV|^EV\.|^BOBINA|^CONECTOR|^INTERFACE|^PLAQUETA|^TEMPORIZADOR/, pide: /valvula|electrovalvula|bobina|conector/ },
      { id: "frl", nombre: "tratamiento de aire (filtros, reguladores, lubricadores, manómetros)", re: /^FILTRO|^REGULADOR (AIGNEP|DE PRESION|INOX|AGUA)|^REGULADOR AIGNEP|^LUBRICADOR|^MANOMETRO|^GRUPO|^PURGA|^MEMBRANA|^PRESOSTATO|^MULTIPLICADOR|^ACEITE/, pide: /filtro|lubricador|manometro|\bfrl\b|regulador de presion|presostato/ },
      { id: "caudal", nombre: "reguladores de caudal", re: /^REGULADOR DE (FLUJO|CAUDAL)/, pide: /caudal|flujo/ },
      { id: "enchufes", nombre: "enchufes rápidos", re: /^ENCHUFE|^PROTECTOR ENCHUFE/, pide: /enchufe/ },
      { id: "soplado", nombre: "pistolas de soplado, boquillas y silenciadores", re: /^PISTOLA|^BOQUILLA|^PEINE|^SILENCIADOR/, pide: /pistola|soplad|boquilla|silenciador/ },
      { id: "herramientas", nombre: "herramientas (cortatubos, maletines)", re: /^CORTATUBOS|^CUCHILLA|^MALETIN|^PINZA|^MUELLE/, pide: /cortatubos|maletin|herramienta/ },
    ],
  },
];

export interface Clase {
  familia: string;
  tipo?: string;
}

/** Familia y tipo de un producto a partir de su nombre en la tienda. */
export function clasificarProducto(nombre: string): Clase | null {
  const n = mayus(nombre);
  for (const f of FAMILIAS) {
    if (!f.incluye.test(n) || f.excluye?.test(n)) continue;
    let tipo: string | undefined;
    if (f.id === "soportes") {
      // Material primero (lo que más preguntan); la forma va aparte.
      tipo = f.tipos.find((t) => t.re.test(n))?.id;
      if (!tipo && formaSoporte(n)) tipo = "fundicion";
    } else {
      tipo = f.tipos.find((t) => t.re.test(n))?.id;
    }
    return { familia: f.id, tipo };
  }
  return null;
}

/** Forma del cuerpo (pie, brida…), solo soportes. */
export function formaDeSoporte(nombre: string): string | null {
  return formaSoporte(mayus(nombre));
}

export const NOMBRE_FORMA: Record<string, string> = {
  pie: "de pie (UCP)",
  "pie-alto": "de pie con base roscada / alto (UCPA)",
  "brida-cuadrada": "de brida cuadrada, 4 agujeros (UCF)",
  "brida-oval": "de brida oval, 2 agujeros (UCFL)",
  "brida-redonda": "de brida redonda con centraje (UCFC)",
  "brida-3": "de brida de 3 agujeros (UCFB / UCFA)",
  tensor: "tensores (UCT)",
  colgante: "colgantes",
  partido: "partidos (SNL / SNC)",
  tapa: "tapas",
  chapa: "de chapa",
};

const PIDE_FORMA: Array<[RegExp, string]> = [
  [/\bde pie\b|\bucp\b|\bbase horizontal|\bbancada/, "pie"],
  [/\bucpa\b|\bpie alto\b/, "pie-alto"],
  [/\bbrida cuadrada|\b4 agujeros|\bcuatro agujeros|\bucf\b/, "brida-cuadrada"],
  [/\bbrida oval|\bovalad|\b2 agujeros|\bdos agujeros|\brombo|\bucfl\b/, "brida-oval"],
  [/\bbrida redonda|\bcircular|\bucfc\b/, "brida-redonda"],
  [/\btensor(es)?\b|\btensar|\buct\b/, "tensor"],
];

/** Marcas que reconocemos en el nombre del producto. */
export function marcaDeNombre(nombre: string): string | null {
  const n = mayus(nombre);
  if (/\bAIGNEP|AIGENP/.test(n)) return "Aignep";
  if (/\bBONDIOLI/.test(n)) return "Bondioli";
  if (/\bCONTINENTAL/.test(n)) return "Continental";
  if (/^NTN\b/.test(n)) return "NTN";
  if (/^SNR\b|\bSNR\b/.test(n)) return "SNR";
  if (/^FAG\b|\bFAG\b/.test(n)) return "FAG";
  if (/^INA\b|\bINA\b/.test(n)) return "INA";
  if (/\bTL\b|TRANSLINK|TL PRO/.test(n)) return "TL (Translink)";
  if (/\bSEDIS\b/.test(n)) return "Sedis";
  if (/\bDL\b/.test(n)) return "DL";
  return null;
}

const PIDE_MARCA: Array<[RegExp, string]> = [
  [/\bntn\b/, "NTN"],
  [/\bsnr\b/, "SNR"],
  [/\btl\b|translink/, "TL (Translink)"],
  [/\bcontinental\b/, "Continental"],
  [/\baignep\b/, "Aignep"],
  [/\bbondioli\b/, "Bondioli"],
  [/\bfag\b/, "FAG"],
  [/\bina\b/, "INA"],
];

export interface ConsultaFamilia {
  familia: Familia;
  /** Tipos pedidos (vacío = todos). */
  tipos: string[];
  /** Forma de soporte pedida. */
  forma?: string;
  marca?: string;
  /** Pide acero inoxidable (en soportes va por tipo; en el resto, por el nombre). */
  inox?: boolean;
  /** Diámetro de eje en mm (soportes, taper, retenes). */
  eje?: number;
  /** Serie numérica pedida (205, 1610, 08B…). */
  serie?: string;
  /** Lo que se ha entendido, en castellano. */
  descripcion: string;
}

function ejeMm(plano: string): number | null {
  const m =
    plano.match(/\beje\s+(?:de\s+)?(\d{1,3})(?:[.,]\d)?\s*(?:mm|milimetros)?\b/) ??
    plano.match(/\b(\d{1,3})\s*(?:mm|milimetros)\s+de\s+eje\b/) ??
    plano.match(/\bpara\s+(?:un\s+)?(?:eje\s+)?(?:de\s+)?(\d{2,3})\s*(?:mm|milimetros)\b/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 5 && n <= 200 ? n : null;
}

/** Serie de soporte/inserto UC2xx para un eje en mm (12→201, 15→202, 17→203, 20→204, 25→205…). */
export function serieSoporteParaEje(eje: number): string | null {
  const fijas: Record<number, string> = { 12: "201", 15: "202", 17: "203" };
  if (fijas[eje]) return fijas[eje];
  if (eje >= 20 && eje <= 90 && eje % 5 === 0) return `2${String(eje / 5).padStart(2, "0")}`;
  return null;
}

/**
 * ¿El cliente pregunta por una FAMILIA de producto (no por una referencia
 * concreta)? Devuelve qué familia y qué filtros ha dado. Si el mensaje actual
 * solo afina ("¿y de inox?", "¿y de pie?"), se toma la familia del historial.
 */
export function consultaDeFamilia(message: string, anterioresDelCliente: string[] = []): ConsultaFamilia | null {
  const plano = minus(message);
  let familia = FAMILIAS.find((f) => f.detectar.test(plano));

  // Seguimiento corto que solo afina sobre la familia de antes.
  if (!familia && plano.length <= 90) {
    const afina = /^\s*(y\s|¿y\s|tambien|tienes|teneis|hay|vale|y de|de |en )|\b(inox|fundicion|termoplastic|partid|de pie|brida|tensor|viton|nbr|doble|triple|simple|conic|cilindric|agujas|axial|rotula|dentad|trapecial|estrecha)\b/;
    if (afina.test(plano)) {
      for (const prev of [...anterioresDelCliente].reverse()) {
        const f = FAMILIAS.find((x) => x.detectar.test(minus(prev)));
        if (f) {
          familia = f;
          break;
        }
      }
    }
  }
  if (!familia) return null;

  const tipos = familia.tipos.filter((t) => t.pide?.test(plano)).map((t) => t.id);
  const forma = familia.id === "soportes" ? PIDE_FORMA.find(([re]) => re.test(plano))?.[1] : undefined;
  const marca = PIDE_MARCA.find(([re]) => re.test(plano))?.[1];
  const eje = ejeMm(plano) ?? undefined;
  let serie: string | undefined;
  if (familia.id === "soportes") {
    serie = plano.match(/\b(2\d{2}|3\d{2})\b/)?.[1] ?? (eje ? serieSoporteParaEje(eje) ?? undefined : undefined);
  } else if (familia.id === "taper") {
    serie = plano.match(/\b(1008|1108|1210|1215|1610|1615|2012|2517|2525|3020|3030|3525|3535|4040|4545|5050)\b/)?.[1];
  } else if (familia.id === "cadenas") {
    serie = plano.match(/\b(0?[4-9]|1[0-9]|2[0-9])\s?b\b/)?.[1]?.padStart(2, "0");
  } else if (familia.id === "bondioli") {
    const s = plano.match(/\bserie\s*g?(\d{1,2})\b/)?.[1] ?? plano.match(/\bg(\d{1,2})\b/)?.[1];
    serie = s ? `G${s}` : undefined;
  }

  const partes = [familia.nombre];
  if (tipos.length) partes.push(tipos.map((t) => familia!.tipos.find((x) => x.id === t)?.nombre).join(" o "));
  if (forma) partes.push(NOMBRE_FORMA[forma]);
  if (marca) partes.push(`marca ${marca}`);
  const inox = familia.id !== "soportes" && /\binox|inoxidable/.test(plano) ? true : undefined;
  if (inox) partes.push("inoxidables");
  if (eje) partes.push(`eje de ${eje} mm`);
  if (serie) partes.push(`serie ${serie}`);
  return { familia, tipos, forma, marca, eje, serie, inox, descripcion: partes.join(", ") };
}

export interface ArticuloIndice {
  id: number;
  name: string;
  reference?: string;
}

/** ¿El producto cumple lo que pide el cliente? */
export function cumpleConsulta(p: ArticuloIndice, c: ConsultaFamilia): boolean {
  const clase = clasificarProducto(p.name);
  if (!clase || clase.familia !== c.familia.id) return false;
  const n = mayus(p.name);
  if (c.tipos.length) {
    const ok = c.tipos.some((t) => {
      const def = c.familia.tipos.find((x) => x.id === t);
      // Manda la clasificación: "SOPORTE TERMOPLASTICO … + ROD INOX" lleva
      // INOX en el nombre pero NO es un soporte inoxidable.
      return clase.tipo ? clase.tipo === t : def ? def.re.test(n) : false;
    });
    if (!ok) return false;
  }
  if (c.forma && formaSoporte(n) !== c.forma) return false;
  // Quien pide un soporte concreto (material, forma, eje) quiere la unidad
  // completa: el cuerpo suelto (SNR P 206, SP 205 INOX…) solo si lo pide.
  if (clase.tipo === "cuerpo" && !c.tipos.includes("cuerpo") && (c.tipos.length || c.forma || c.serie || c.eje)) return false;
  if (c.marca && marcaDeNombre(p.name) !== c.marca) return false;
  if (c.inox && !/INOX/.test(n)) return false;
  if (c.serie) {
    if (c.familia.id === "cadenas") {
      if (!new RegExp(`\\b${c.serie}B`).test(n)) return false;
    } else if (!new RegExp(`(^|[^\\d])${c.serie.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\d]|$)`).test(n)) return false;
  }
  if (c.eje && c.familia.id === "taper") {
    if (!new RegExp(`EJE\\s?${c.eje}(?!\\d)`).test(n)) return false;
  }
  return true;
}

export interface ResumenFamilia {
  total: number;
  porTipo: Array<{ id: string; nombre: string; cuantos: number; ejemplos: string[] }>;
  porForma: Array<{ forma: string; nombre: string; cuantos: number }>;
  marcas: Array<{ marca: string; cuantos: number }>;
  coincidentes: ArticuloIndice[];
}

/** Cuenta lo que hay en el catálogo para la consulta (y la familia entera). */
export function resumirFamilia(indice: ArticuloIndice[], c: ConsultaFamilia): ResumenFamilia {
  const coincidentes = indice.filter((p) => cumpleConsulta(p, c));
  const tipos = new Map<string, { nombre: string; cuantos: number; ejemplos: string[] }>();
  const formas = new Map<string, number>();
  const marcas = new Map<string, number>();
  for (const p of coincidentes) {
    const clase = clasificarProducto(p.name);
    const tid = clase?.tipo ?? "otros";
    const def = c.familia.tipos.find((t) => t.id === tid);
    const t = tipos.get(tid) ?? { nombre: def?.nombre ?? (c.familia.tipos.length ? "otros" : c.familia.nombre), cuantos: 0, ejemplos: [] };
    t.cuantos++;
    if (t.ejemplos.length < 3) t.ejemplos.push(p.name.replace(/\s+/g, " ").trim());
    tipos.set(tid, t);
    if (c.familia.id === "soportes") {
      const f = formaSoporte(mayus(p.name));
      if (f) formas.set(f, (formas.get(f) ?? 0) + 1);
    }
    const m = marcaDeNombre(p.name);
    if (m) marcas.set(m, (marcas.get(m) ?? 0) + 1);
  }
  return {
    total: coincidentes.length,
    porTipo: Array.from(tipos, ([id, v]) => ({ id, ...v })).sort((a, b) => b.cuantos - a.cuantos),
    porForma: Array.from(formas, ([forma, cuantos]) => ({ forma, nombre: NOMBRE_FORMA[forma] ?? forma, cuantos })).sort((a, b) => b.cuantos - a.cuantos),
    marcas: Array.from(marcas, ([marca, cuantos]) => ({ marca, cuantos })).sort((a, b) => b.cuantos - a.cuantos),
    coincidentes,
  };
}

/**
 * Elige qué artículos enseñar como tarjeta: variados (uno por tipo/forma
 * antes de repetir) y, entre ellos, los que tienen stock primero.
 */
export function elegirMuestra(coincidentes: ArticuloIndice[], stock: Record<number, number>, max = 4): ArticuloIndice[] {
  const conStock = coincidentes.filter((p) => (stock[p.id] ?? 0) > 0);
  const base = conStock.length ? conStock : coincidentes;
  const clave = (p: ArticuloIndice) => {
    const c = clasificarProducto(p.name);
    return `${c?.tipo ?? ""}|${formaSoporte(mayus(p.name)) ?? ""}`;
  };
  const vistos = new Set<string>();
  const out: ArticuloIndice[] = [];
  const ordenados = [...base].sort((a, b) => (stock[b.id] ?? 0) - (stock[a.id] ?? 0));
  // Primero uno de cada TIPO (fundición, inox, termoplástico…), luego formas.
  const tiposVistos = new Set<string>();
  for (const p of ordenados) {
    const t = clasificarProducto(p.name)?.tipo ?? "";
    if (tiposVistos.has(t) || t === "cuerpo" || t === "tapa") continue;
    tiposVistos.add(t);
    vistos.add(clave(p));
    out.push(p);
    if (out.length >= max) return out;
  }
  for (const p of ordenados) {
    if (out.includes(p)) continue;
    const k = clave(p);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(p);
    if (out.length >= max) return out;
  }
  for (const p of ordenados) {
    if (out.length >= max) break;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

// ───────────── BÚSQUEDA POR PALABRAS (lo que no es una familia) ─────────────

const VACIAS = new Set(
  "comprar compro pedir pido encargar saber informacion info ver mirar consultar consulta preguntar pregunta de del la las el los un una unos unas para con sin por y o en a al que tipo tipos modelo modelos teneis tienes tiene tenemos hay vendeis vendes venden disponeis dispones me nos quiero necesito busco buscando algun alguna algunos algunas este esta estos estas ese esa eso cual cuales que como precio precios stock referencia referencias ref articulo articulos producto productos disponible disponibles catalogo pagina web tienda vuestra vuestro vuestros vuestras su sus mi mis otro otra otros otras mas menos muy bien hola buenas buenos dias tardes gracias favor porfa".split(" ")
);

/** Raíz sencilla para comparar plural/singular ("soportes" ≈ "soporte", "válvulas" ≈ "valvula"). */
export function raiz(palabra: string): string {
  let w = minus(palabra).replace(/[^a-z0-9ñ]/g, "");
  if (w.length > 4 && /(ones)$/.test(w)) w = w.slice(0, -2); // racores? no; "conexiones"→"conexion"
  else if (w.length > 4 && /(res|les|nes|des)$/.test(w)) w = w.slice(0, -2); // reguladores→regulador
  else if (w.length > 3 && /s$/.test(w)) w = w.slice(0, -1);
  return w;
}

/** Palabras con contenido de una consulta en lenguaje natural. */
export function palabrasDeConsulta(texto: string): string[] {
  return minus(texto)
    .split(/[^a-z0-9ñ/.-]+/)
    .map((w) => w.replace(/^[.\-/]+|[.\-/]+$/g, ""))
    .filter((w) => w.length >= 2 && !VACIAS.has(w))
    .map(raiz)
    .filter((w) => w.length >= 2);
}

/** ¿El nombre del producto contiene TODAS las palabras (por raíz)? */
export function nombreTienePalabras(nombre: string, palabras: string[]): boolean {
  if (!palabras.length) return false;
  const n = minus(nombre);
  const tokens = n.split(/[^a-z0-9ñ/.-]+/).map(raiz);
  return palabras.every((w) => tokens.some((t) => t === w || (w.length >= 4 && t.startsWith(w))) || (w.length >= 5 && n.includes(w)));
}

/**
 * ¿El cliente pregunta si tenemos un TIPO de producto ("¿tenéis poleas?",
 * "¿vendéis grasa?")? Devuelve las palabras del producto, o null.
 */
export function preguntaPorTipoDeProducto(message: string): string[] | null {
  const plano = minus(message);
  if (!/\b(teneis|tienes|tienen|tenemos|hay|vendeis|vendes|venden|disponeis|dispones|trabajais|manejais|ofreceis|busco|necesito|quiero|que .* (teneis|tienes|hay))\b/.test(plano)) return null;
  const palabras = palabrasDeConsulta(plano);
  return palabras.length && palabras.length <= 4 ? palabras : null;
}

/** Quita del texto todo lo que case con estas expresiones (para ver qué palabras quedan sueltas). */
function quitar(texto: string, res: RegExp[]): string {
  let t = ` ${texto} `;
  // Se quita la palabra ENTERA que contiene la coincidencia ("partidos", no solo "partid").
  for (const re of res) t = t.replace(new RegExp(`[a-z0-9ñ]*(?:${re.source})[a-z0-9ñ]*`, "g"), " ");
  return t;
}

/**
 * Búsqueda en lenguaje natural sobre el índice del catálogo ("soportes de
 * fundición", "rodamiento de rodillos cónicos 32010", "racor codo 8 mm").
 *
 * La familia, el tipo, la forma, la marca y la serie se resuelven por
 * CLASIFICACIÓN (así "soportes de fundición" encuentra "SNR UCP 205", que no
 * lleva ninguna de esas palabras); lo que sobre tiene que aparecer en el
 * nombre (singular/plural y tildes dan igual). Devuelve [] si la consulta no
 * tiene ninguna palabra de verdad (una referencia suelta va por otra vía).
 */
export function buscarEnIndice(indice: ArticuloIndice[], query: string): ArticuloIndice[] {
  const plano = minus(query);
  if (!palabrasDeConsulta(plano).some((w) => /[a-zñ]{4,}/.test(w))) return [];
  const c = consultaDeFamilia(query);
  if (!c) {
    const palabras = palabrasDeConsulta(plano);
    return ordenarPorPalabras(indice.filter((p) => nombreTienePalabras(p.name, palabras)), plano);
  }
  const resto = palabrasDeConsulta(
    quitar(plano, [
      c.familia.detectar,
      ...c.familia.tipos.map((t) => t.pide).filter((x): x is RegExp => !!x),
      ...PIDE_FORMA.map(([re]) => re),
      ...PIDE_MARCA.map(([re]) => re),
      /\beje\s+(de\s+)?\d+([.,]\d)?\s*(mm|milimetros)?/,
      /\b\d+\s*(mm|milimetros)\s+de\s+eje/,
      ...(c.serie ? [new RegExp(`\\b${c.serie.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s?b?\\b`)] : []),
      /\b(rodillos?|bolas?|tipo|serie|marca|de|con|para)\b/,
      /\binox\w*/,
    ])
  );
  return ordenarPorPalabras(
    indice.filter((p) => cumpleConsulta(p, c) && (resto.length === 0 || nombreTienePalabras(p.name, resto))),
    plano
  );
}

/**
 * De una lista ya filtrada por familia, los que llevan en el nombre MÁS
 * palabras o medidas del mensaje ("electroválvulas 5/2" → las 5/2). Si
 * ninguno lleva ninguna, la lista tal cual.
 */
export function mejoresPorPalabras(lista: ArticuloIndice[], texto: string): ArticuloIndice[] {
  const plano = minus(texto);
  const pal = Array.from(new Set([...palabrasDeConsulta(plano), ...(plano.match(/\b\d+([.,/]\d+)?\b/g) ?? [])]));
  if (!pal.length || !lista.length) return lista;
  const nota = (p: ArticuloIndice) => {
    const toks = minus(p.name).split(/[^a-z0-9ñ/.,-]+/).flatMap((t) => [t, ...t.split(/[-]/)]).map(raiz);
    return pal.filter((w) => toks.some((t) => t === w || (w.length >= 4 && t.startsWith(w)))).length;
  };
  const notas = lista.map((p) => ({ p, s: nota(p) }));
  const max = Math.max(...notas.map((x) => x.s));
  return max > 0 ? notas.filter((x) => x.s === max).map((x) => x.p) : lista;
}

/** Delante los que llevan en el nombre más palabras (o números) de la consulta: "racor codo 8" → los CODO de 8. */
function ordenarPorPalabras(lista: ArticuloIndice[], plano: string): ArticuloIndice[] {
  const pal = Array.from(new Set([...palabrasDeConsulta(plano), ...(plano.match(/\b\d+([.,/]\d+)?\b/g) ?? [])]));
  if (!pal.length) return lista;
  const nota = (p: ArticuloIndice) => {
    const toks = minus(p.name).split(/[^a-z0-9ñ/.,-]+/).map(raiz);
    return pal.filter((w) => toks.some((t) => t === w || (w.length >= 4 && t.startsWith(w)))).length;
  };
  return lista.map((p, i) => ({ p, i, s: nota(p) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.p);
}

/** ¿Pregunta por disponibilidad o pide productos (y no solo una explicación)? */
export function pideProductos(message: string): boolean {
  const plano = minus(message);
  return /\b(teneis|tienes|tienen|tenemos|hay|vendeis|vendes|venden|disponeis|dispones|ofreceis|trabajais|manejais|busco|buscando|necesito|necesitaria|quiero|querria|me interesa|precio|precios|cuanto cuesta|stock|disponible|disponibles|catalogo|opciones|modelos|tipos|que .* (teneis|tienes|hay|vendeis)|ensen|muestr|recomiend|aconsej|cual me|alguno|alguna|dame|deme|ponme|pasame|mandame|enviame|quisiera|me hace falta|me haria falta|me hacen falta)\b/.test(plano);
}

/** "¿Qué vendéis?", "¿qué productos tenéis?", "¿qué hay en el catálogo?" */
export function preguntaGeneralCatalogo(message: string): boolean {
  const plano = minus(message);
  return (
    /\bque (productos|articulos|cosas|materiales|familias|marcas|tipo de productos?|tipos de productos?)\b.*\b(teneis|tienes|vendeis|vendes|hay|trabajais|ofreceis|manejais)\b/.test(plano) ||
    /\bque (vendeis|vendes|ofreceis|trabajais|manejais)\b/.test(plano) ||
    /\b(que|cual) (hay|tienes|teneis) en (el|vuestro|tu) catalogo\b/.test(plano) ||
    /\bvuestro catalogo\b|\btodo el catalogo\b|\bque catalogo\b/.test(plano)
  );
}

/** Resumen de todo el catálogo por familias (para "¿qué vendéis?"). */
export function resumenGeneral(indice: ArticuloIndice[]): Array<{ familia: Familia; cuantos: number; tipos: string[] }> {
  const cuenta = new Map<string, { n: number; tipos: Map<string, number> }>();
  for (const p of indice) {
    const c = clasificarProducto(p.name);
    if (!c) continue;
    const e = cuenta.get(c.familia) ?? { n: 0, tipos: new Map() };
    e.n++;
    if (c.tipo) e.tipos.set(c.tipo, (e.tipos.get(c.tipo) ?? 0) + 1);
    cuenta.set(c.familia, e);
  }
  return FAMILIAS.filter((f) => cuenta.has(f.id)).map((f) => {
    const e = cuenta.get(f.id)!;
    const tipos = Array.from(e.tipos).sort((a, b) => b[1] - a[1]).map(([id]) => f.tipos.find((t) => t.id === id)?.nombre ?? id);
    return { familia: f, cuantos: e.n, tipos };
  });
}

/**
 * ¿Merece la pena enseñar tarjetas de muestra? Solo cuando la consulta está
 * acotada (tipo, forma, serie, eje o marca) o la familia es pequeña. Enseñar
 * cuatro rodamientos o cuatro retenes al azar no ayuda a nadie; en correas
 * nunca (sin perfil y longitud cualquier correa sería inventada).
 */
export function convieneMuestra(c: ConsultaFamilia): boolean {
  if (c.familia.id === "correas") return false;
  if (c.tipos.length || c.forma || c.serie || c.eje || c.inox) return true;
  return ["soportes", "cadenas", "taper", "bondioli", "accesorios-montaje"].includes(c.familia.id) || (!!c.marca && c.familia.id !== "rodamientos");
}

/**
 * Lo que necesitamos saber para dar la referencia exacta, por familia. Es lo
 * que el chat le pide al cliente cuando pregunta "¿tenéis…?" o "¿qué tipos
 * de… tenéis?" (criterio del cliente, 03-11-2026: tipos + datos necesarios,
 * sin nombrar artículos sueltos ni cifras).
 */
export const DATOS_NECESARIOS: Record<string, string[]> = {
  soportes: [
    "Diámetro del eje (o la serie del rodamiento: 204, 205, 206…)",
    "Forma de montaje: de pie sobre base horizontal, brida contra pared (4 o 2 agujeros), tensor o partido",
    "Entorno de trabajo: estándar (fundición) o humedad, lavados o alimentaria (inoxidable o termoplástico)",
    "Si la tiene, la referencia grabada en el soporte actual",
  ],
  rodamientos: [
    "La referencia grabada en el anillo, con sus sufijos (p. ej. 6205 2RS C3)",
    "Si no se lee: medidas de eje × diámetro exterior × ancho en mm",
    "Protección: abierto, con deflectores metálicos (ZZ) o con juntas de goma (2RS)",
    "Condiciones especiales si las hay: velocidad alta, temperatura, agua o polvo",
  ],
  correas: [
    "Perfil y longitud marcados en el flanco (p. ej. A 1250, SPZ 1000, 600-8M-30)",
    "Si es dentada: paso, número de dientes o longitud, y ancho",
    "Si no se lee: tipo (trapecial, dentada o Poly-V) y medida aproximada",
  ],
  retenes: [
    "Medidas: eje × alojamiento × ancho en mm (p. ej. 25x40x7)",
    "Material: NBR (estándar, hasta unos 100 °C) o Vitón/FKM (alta temperatura o productos químicos)",
    "Tipo: con muelle, doble labio (con guardapolvo) o exterior metálico",
  ],
  cadenas: [
    "Paso de la cadena (06B, 08B, 10B, 12B, 16B… o su medida en pulgadas)",
    "Hileras: simple, doble o triple",
    "Material: acero estándar o inoxidable",
    "Si necesita eslabones de unión (rectos o acodados)",
  ],
  taper: [
    "Tamaño del casquillo (1008, 1108, 1210, 1610, 2012, 2517…), que va grabado en la polea o el piñón",
    "Diámetro del eje en mm",
  ],
  "accesorios-montaje": [
    "Qué pieza necesita: manguito de fijación o desmontaje, tuerca, arandela, anillo o tapa ciega",
    "La referencia del rodamiento o del soporte en el que va montada",
  ],
  bondioli: [
    "Serie de la transmisión (G1, G2, G4, G5, G7, G8, G9 u homocinética)",
    "Qué pieza: transmisión completa, cruceta, horquilla, tubo, protección, limitador o rueda libre",
    "Medidas de la pieza si las tiene (cruceta, tubo, longitud de la transmisión)",
  ],
  neumatica: [
    "Qué pieza necesita (racor, tubo, cilindro, válvula, electroválvula, filtro o regulador…)",
    "Diámetro del tubo (4, 6, 8, 10, 12 mm) y rosca de conexión (M5, 1/8\", 1/4\", 3/8\", 1/2\")",
    "En cilindros: diámetro y carrera; en válvulas: vías y posiciones (3/2, 5/2), accionamiento y tensión de la bobina",
  ],
};
