/**
 * Gate 3.9 del mapa v2.3 — DRIFT del core vendorizado contra el paquete.
 *
 * Durante la transición (apps con copias vendorizada vivas), falla el CI si
 * la copia de ESTA app diverge del paquete: "si el motor diverge, dos puestos
 * leen un acta distinto". Sustituye a scripts/qa-core-vendorizado.ts (que
 * comparaba repo↔repo hermano) — ahora la referencia es EL PAQUETE.
 *
 *   bun packages/scanner-core/scripts/qa-drift-core.ts [ruta-e14-de-la-app]
 *
 * Con los módulos ya convertidos en shims (re-export del paquete), el gate
 * reporta "shim" y sale verde: la transición cerró y este gate se BORRA
 * (plan §5.5 — lo jubila la adopción completa).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PAQUETE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORE_PKG = join(PAQUETE, "src", "core");

// ruta e14 de la app que llama: arg, o autodetección (D y S)
const ARG = process.argv[2];
function detectar(): string | null {
  const candidatas = [
    "src/lib/e14", // digielect14
    "src/modules/digitalizador/lib/e14", // supervision-e14
  ];
  for (const c of candidatas) {
    if (existsSync(resolve(process.cwd(), c, "core"))) return resolve(process.cwd(), c);
  }
  return null;
}
const E14_APP = ARG ? resolve(ARG) : detectar();
if (!E14_APP || !existsSync(join(E14_APP, "core"))) {
  console.error("qa-drift: no se encontró la carpeta e14 de la app (pásala como argumento)");
  process.exit(1);
}

const md5 = (p: string): string =>
  createHash("md5").update(readFileSync(p, "utf8").replace(/\r\n/g, "\n")).digest("hex");

const MODULOS = ["types.ts", "codec.ts", "image-modes.ts", "image-processor.ts", "detector-client.ts", "ocr.ts"];
let fallos = 0;
let shims = 0;
for (const m of MODULOS) {
  const rutaApp = join(E14_APP, "core", m);
  const rutaPkg = join(CORE_PKG, m);
  if (!existsSync(rutaApp)) {
    console.error(`  ✗ ${m}: FALTA en la app`);
    fallos++;
    continue;
  }
  const textoApp = readFileSync(rutaApp, "utf8");
  // shim de transición: re-exporta del paquete → no hay copia que comparar
  if (textoApp.includes("@jg-stevan/scanner-core")) {
    console.log(`  ○ ${m}: shim (transición cerrada para este módulo)`);
    shims++;
    continue;
  }
  const hApp = md5(rutaApp);
  const hPkg = md5(rutaPkg);
  if (hApp !== hPkg) {
    console.error(`  ✗ ${m}: DIVERGE (app ${hApp} ≠ paquete ${hPkg})`);
    fallos++;
  } else {
    console.log(`  ✓ ${m}: idéntico`);
  }
}
if (fallos > 0) {
  console.error(`\nqa-drift: ${fallos} módulo(s) divergen — propagar el cambio al paquete (o al revés) EN EL MISMO COMMIT`);
  process.exit(1);
}
console.log(`\nqa-drift OK (${MODULOS.length - shims} idénticos · ${shims} shims) — la paridad la da el paquete`);
