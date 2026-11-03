// Genera la copia del índice del catálogo (data/kb/catalogo-indice.json) y el
// listado por familias para ESGAS (docs/CATALOGO-POR-FAMILIAS.md + Excel).
//
// Uso:
//   npm run build:catalogo                      → baja el catálogo de PrestaShop
//                                                 (PRESTASHOP_BASE_URL + PRESTASHOP_API_KEY)
//   npm run build:catalogo -- volcado.json      → usa un volcado ya bajado
//                                                 (formato de /api/auditoria: [{id,name,ref,stockAhora}])
//
// El chat busca SIEMPRE en el catálogo vivo de la tienda; esta copia es el
// respaldo para cuando la tienda tarda en servir el índice completo (así un
// "¿tenéis soportes?" nunca acaba en "no tenemos" por un timeout).
export {};
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const cat = require("../lib/catalogo") as typeof import("../lib/catalogo");

type Art = { id: number; name: string; reference: string; stock?: number };

async function bajarDeTienda(): Promise<Art[]> {
  const base = String(process.env.PRESTASHOP_BASE_URL ?? "").replace(/\/$/, "");
  const key = String(process.env.PRESTASHOP_API_KEY ?? "");
  if (!base || !key) throw new Error("Faltan PRESTASHOP_BASE_URL y PRESTASHOP_API_KEY (o pasa un volcado .json).");
  const auth = { Authorization: "Basic " + Buffer.from(key + ":").toString("base64") };
  const r = await fetch(`${base}/api/products?output_format=JSON&display=[id,name,reference,supplier_reference,active]`, { headers: auth });
  if (!r.ok) throw new Error(`products HTTP ${r.status}`);
  const d = await r.json();
  const s = await fetch(`${base}/api/stock_availables?output_format=JSON&display=[id_product,id_product_attribute,quantity]`, { headers: auth });
  const sd = s.ok ? await s.json() : { stock_availables: [] };
  const stock = new Map<number, number>();
  for (const x of sd.stock_availables ?? []) if (Number(x.id_product_attribute) === 0) stock.set(Number(x.id_product), Number(x.quantity) || 0);
  const txt = (v: any) => (typeof v === "string" ? v : Array.isArray(v) ? String(v[0]?.value ?? "") : String(v?.language?.[0]?.value ?? v ?? ""));
  return (d.products ?? [])
    .filter((p: any) => String(p.active) !== "0")
    .map((p: any) => ({
      id: Number(p.id),
      name: txt(p.name).trim(),
      reference: [txt(p.reference), txt(p.supplier_reference)].filter(Boolean).join(" "),
      stock: stock.get(Number(p.id)),
    }));
}

function desdeVolcado(fichero: string): Art[] {
  const a = JSON.parse(fs.readFileSync(fichero, "utf8"));
  return a
    .filter((p: any) => String(p.activo ?? "1") !== "0")
    .map((p: any) => ({ id: Number(p.id), name: String(p.name).trim(), reference: String(p.ref ?? p.reference ?? ""), stock: p.stockAhora }));
}

async function main(): Promise<void> {
  const fichero = process.argv[2];
  const arts = fichero ? desdeVolcado(fichero) : await bajarDeTienda();
  arts.sort((a, b) => a.id - b.id);
  const raiz = path.join(__dirname, "..");

  // 1) Índice de respaldo: [id, nombre, referencia]
  fs.writeFileSync(path.join(raiz, "data/kb/catalogo-indice.json"), JSON.stringify(arts.map((a) => [a.id, a.name, a.reference])));

  // 2) Listado por familias
  const sinClase = arts.filter((a) => !cat.clasificarProducto(a.name));
  const filas: any[] = [];
  let md = `# Catálogo de la página por familias\n\n` +
    `Generado el ${new Date().toISOString().slice(0, 10)} a partir de ${arts.length} artículos de b2b.esgas.es. ` +
    `Es lo que el chat reconoce cuando un cliente pregunta "¿tenéis…?" o "¿qué … tenéis?".\n` +
    `Se regenera con \`npm run build:catalogo\`.\n\n`;
  for (const f of cat.FAMILIAS) {
    const c = { familia: f, tipos: [], descripcion: f.nombre };
    const r = cat.resumirFamilia(arts, c);
    const conStock = r.coincidentes.filter((p: any) => (arts.find((a) => a.id === p.id)?.stock ?? 0) > 0).length;
    md += `## ${f.nombre[0].toUpperCase() + f.nombre.slice(1)} — ${r.total} artículos${conStock ? ` (${conStock} con stock)` : ""}\n\n${f.explicacion}\n\n`;
    md += `| Tipo | Artículos | Ejemplos |\n|---|---:|---|\n`;
    for (const t of r.porTipo) md += `| ${t.nombre} | ${t.cuantos} | ${t.ejemplos.join(" · ")} |\n`;
    if (r.porForma.length) {
      md += `\n**Por forma del cuerpo:** ` + r.porForma.map((x) => `${x.nombre} ${x.cuantos}`).join(" · ") + `\n`;
    }
    if (r.marcas.length) md += `\n**Marcas:** ` + r.marcas.map((m) => `${m.marca} ${m.cuantos}`).join(" · ") + `\n`;
    md += `\n`;
    for (const p of r.coincidentes) {
      const a = arts.find((x) => x.id === p.id)!;
      const cl = cat.clasificarProducto(a.name);
      const tipo = f.tipos.find((t) => t.id === cl?.tipo)?.nombre ?? "";
      filas.push({
        Familia: f.nombre,
        Tipo: tipo,
        Forma: f.id === "soportes" ? cat.NOMBRE_FORMA[cat.formaDeSoporte(a.name) ?? ""] ?? "" : "",
        Marca: cat.marcaDeNombre(a.name) ?? "",
        Artículo: a.name,
        Referencia: a.reference,
        Stock: a.stock ?? "",
        "Id tienda": a.id,
      });
    }
  }
  if (sinClase.length) {
    md += `## Sin familia (${sinClase.length})\n\n` + sinClase.map((a) => `- ${a.name}`).join("\n") + "\n";
    for (const a of sinClase) filas.push({ Familia: "(sin familia)", Tipo: "", Forma: "", Marca: "", Artículo: a.name, Referencia: a.reference, Stock: a.stock ?? "", "Id tienda": a.id });
  }
  fs.writeFileSync(path.join(raiz, "docs/CATALOGO-POR-FAMILIAS.md"), md);

  const destinoXlsx = process.env.CATALOGO_XLSX;
  if (destinoXlsx) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filas);
    ws["!cols"] = [{ wch: 34 }, { wch: 40 }, { wch: 30 }, { wch: 14 }, { wch: 60 }, { wch: 26 }, { wch: 8 }, { wch: 9 }];
    XLSX.utils.book_append_sheet(wb, ws, "Catálogo por familias");
    XLSX.writeFile(wb, destinoXlsx);
  }
  console.log(`${arts.length} artículos · ${arts.length - sinClase.length} clasificados · ${sinClase.length} sin familia`);
  if (sinClase.length) process.exitCode = 1;
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
