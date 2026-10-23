// Empaqueta el módulo de PrestaShop (modules/nexionchat) en
// public/descargas/nexionchat.zip, con la carpeta nexionchat/ dentro, que es
// como lo espera "Subir un módulo". Uso: npm run zip:modulo
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const raiz = path.join(__dirname, "..");
const destino = path.join(raiz, "public", "descargas", "nexionchat.zip");
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.rmSync(destino, { force: true });
execFileSync("python", ["-c", `
import zipfile, os, sys
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(src):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.join("nexionchat", os.path.relpath(full, src)).replace("\\\\", "/"))
`, path.join(raiz, "modules", "nexionchat"), destino], { stdio: "inherit" });
console.log("→", destino);
