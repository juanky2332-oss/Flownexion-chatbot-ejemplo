// Medida exacta que no hay en correas, retenes y taper: lo más cercano de la
// misma familia, sacado del índice completo de la tienda. Sin esto, "correa SPB
// 3622" acababa enseñando dos correas de otro perfil (C136, C236), "retén
// 23x41x7" en un "no tenemos" y "taper 1610 eje 23" en los ejes 15, 16 y 18.
//
// El determinante no se cambia: mismo perfil de correa, mismo tamaño de
// casquillo. Y se avisa de lo que implica: estas piezas no son intercambiables.
//
// Fichero puro: lo prueba scripts/test-kb.ts.

export interface ArticuloMedida {
  id: number;
  name: string;
}

export interface Cercano {
  articulo: ArticuloMedida;
  distancia: number;
  /** Negativo si es menor que lo pedido. */
  lado: number;
}

export interface ConsultaMedida {
  pedido: string;
  cercanos: (indice: ArticuloMedida[]) => Cercano[];
  nota: string;
}

function ordenar(indice: ArticuloMedida[], medir: (n: string) => { distancia: number; lado: number } | null): Cercano[] {
  const out: Cercano[] = [];
  for (const articulo of indice) {
    const m = medir(articulo.name.toUpperCase());
    if (m) out.push({ articulo, ...m });
  }
  return out.sort((a, b) => a.distancia - b.distancia);
}

export function consultaDeMedida(mensaje: string): ConsultaMedida | null {
  const m = String(mensaje ?? "").toUpperCase();

  const correa = /\b(SPZ|SPA|SPB|SPC|XPZ|XPA|XPB|XPC)[\s-]*(\d{3,4})\b/.exec(m);
  if (correa) {
    const [, perfil, largo] = correa;
    const objetivo = Number(largo);
    const re = new RegExp(`\\b${perfil}[\\s-]*(\\d{3,4})\\b`);
    return {
      pedido: `la correa ${perfil} ${largo}`,
      cercanos: (indice) =>
        ordenar(indice, (n) => {
          const h = /CORREA/.test(n) ? re.exec(n) : null;
          return h ? { distancia: Math.abs(Number(h[1]) - objetivo), lado: Number(h[1]) - objetivo } : null;
        }),
      nota:
        `Tienen el mismo perfil ${perfil} y distinta longitud. A favor: entran en las mismas poleas. ` +
        `En contra: solo valen si el tensor de la transmisión tiene recorrido para absorber la diferencia; compruébalo antes de montarla. ` +
        `Si necesitas exactamente la ${perfil} ${largo}, ESGAS te la mira por teléfono o e-mail.`,
    };
  }

  const reten = /(?:RET[EÉ]N|RETENES)?\D{0,12}\b(\d{1,3})\s*[X×*]\s*(\d{1,3})\s*[X×*]\s*(\d{1,2})\b/.exec(m);
  if (reten && /RET[EÉ]N/.test(m)) {
    const [d, D, b] = [Number(reten[1]), Number(reten[2]), Number(reten[3])];
    return {
      pedido: `el retén ${d}x${D}x${b}`,
      cercanos: (indice) =>
        ordenar(indice, (n) => {
          const h = /RETEN|RETÉN/.test(n) ? /\b(\d{1,3})\s*[X×*]\s*(\d{1,3})\s*[X×*]\s*(\d{1,2})\b/.exec(n) : null;
          if (!h) return null;
          const dif = (Number(h[1]) - d) * 100 + (Number(h[2]) - D) * 10 + (Number(h[3]) - b);
          // Primero el eje, luego el alojamiento, luego el ancho.
          return { distancia: Math.abs(Number(h[1]) - d) * 100 + Math.abs(Number(h[2]) - D) * 10 + Math.abs(Number(h[3]) - b), lado: dif };
        }),
      nota:
        `Un retén de otra medida no es un sustituto directo: el eje y el alojamiento tienen que coincidir para que selle. ` +
        `Comprueba las medidas de tu pieza con un calibre y, si necesitas exactamente ${d}x${D}x${b}, ESGAS te lo mira por teléfono o e-mail.`,
    };
  }

  const taper = /TAPER\D{0,10}(\d{4})\D{0,12}\b(\d{2})\b/.exec(m);
  if (taper) {
    const [, tam, eje] = taper;
    const objetivo = Number(eje);
    const re = new RegExp(`TAPER\\s*${tam}\\s*EJE\\s*(\\d{1,3})`);
    return {
      pedido: `el taper ${tam} para eje de ${eje} mm`,
      cercanos: (indice) =>
        ordenar(indice, (n) => {
          const h = re.exec(n);
          return h ? { distancia: Math.abs(Number(h[1]) - objetivo), lado: Number(h[1]) - objetivo } : null;
        }),
      nota:
        `Tienen el mismo tamaño ${tam}, así que entran en la misma polea, pero con otro agujero: uno menor exige mecanizar y uno mayor no monta en tu eje. ` +
        `Si necesitas exactamente eje de ${eje} mm, ESGAS te lo mira por teléfono o e-mail.`,
    };
  }
  return null;
}
