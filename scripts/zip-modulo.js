// Empaqueta el módulo de PrestaShop (modules/nexionchat) en
// public/descargas/nexionchat.zip, con la carpeta nexionchat/ dentro, que es
// como lo espera "Subir un módulo". Uso: npm run zip:modulo
//
// Zip de entrega ya configurado (NO va a public/, lleva la clave secreta):
//   NEXIONCHAT_CLAVE=<64 hex> node scripts/zip-modulo.js "<ruta>/nexionchat.zip"
// Añade nexionchat/clave.php, que el módulo lee al instalarse y luego borra.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const raiz = path.join(__dirname, "..");
const clave = (process.env.NEXIONCHAT_CLAVE || "").trim();
if (clave && !/^[a-f0-9]{64}$/.test(clave)) throw new Error("NEXIONCHAT_CLAVE debe ser 64 caracteres hex");
const destino = process.argv[2] ? path.resolve(process.argv[2]) : path.join(raiz, "public", "descargas", "nexionchat.zip");
if (clave && destino.startsWith(path.join(raiz, "public"))) throw new Error("El zip con la clave no puede ir a public/");
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.rmSync(destino, { force: true });
execFileSync("python", ["-c", `
import zipfile, os, sys
src, out, clave = sys.argv[1], sys.argv[2], sys.argv[3]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(src):
        for f in files:
            if f == "clave.php":
                continue
            full = os.path.join(root, f)
            z.write(full, os.path.join("nexionchat", os.path.relpath(full, src)).replace("\\\\", "/"))
    if clave:
        z.writestr("nexionchat/clave.php", "<?php" + chr(10) + "return '" + clave + "';" + chr(10))
`, path.join(raiz, "modules", "nexionchat"), destino, clave], { stdio: "inherit" });
console.log("→", destino, clave ? "(con clave)" : "");
