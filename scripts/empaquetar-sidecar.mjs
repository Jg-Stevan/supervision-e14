/**
 * scripts/empaquetar-sidecar.mjs — KIT e14-sidecar-instalable-v1 (D81)
 *
 * Produce `dist/supervision-e14-sidecar-win-x64.zip`: la carpeta del sidecar de
 * `native/` congelada con PyInstaller (`--onedir`), con los modelos .onnx
 * dentro, para que un visitante del sitio publicado la descargue y la ejecute
 * SIN tener Python, sin `git clone` y sin terminal.
 *
 * Por qué un binario y no `pip install`: las cifras medidas (D79) son 40-58 s
 * del lote con el sidecar contra ~101,6 s en navegador. Esa ventaja solo existe
 * si el sidecar está corriendo, y `python native/servidor.py` no es una frase
 * que un visitante elector vaya a escribir.
 *
 * Por qué `--onedir` (carpeta en ZIP) y no `--onefile` (un solo .exe) — medido
 * back-to-back en el equipo del dueño (4 núcleos):
 *   · onefile: 108,1 MiB de descarga, 16,7-18,1 s hasta que `/salud` contesta.
 *     Descomprime los 108 MiB a `%TEMP%` EN CADA arranque: 3 de cada 4 segundos
 *     de espera son eso, no OCR (se probó con argparse inválido: 16,0 s en
 *     onefile vs 2,15 s en onedir haciendo el MISMO import).
 *   · onedir:  108,4 MiB de descarga (la compresión se come la diferencia),
 *     4,5-6,3 s hasta `/salud`, 239,5 MiB en disco.
 * Misma descarga, 3,3× menos espera. El ZIP le cobra al visitante un paso
 * («descomprime y ejecuta el de adentro») a cambio de no hacerle esperar 12 s
 * cada vez que abre el sidecar. El costo real de todo esto, además: es un
 * binario SIN FIRMAR y SmartScreen lo va a interrumpir la primera vez (ver
 * `docs/RUNBOOK-sidecar-instalable-v1.md`).
 *
 * Qué hace falta para que el congelado funcione, y dónde está cada pieza:
 *  · `native/e14nativo.py::_modelos()` tiene la rama `sys._MEIPASS`. Sin ella el
 *    .exe aborta con «no encuentro la raíz del proyecto», porque dentro del
 *    bundle NO existe `public/`.
 *  · `--add-data public/models/rapidocr -> models/rapidocr`: PyInstaller no
 *    arrastra archivos que se abren con `open()`; solo los que se importan.
 *  · el `--paths native` para que el análisis encuentre `e14nativo`, que
 *    `servidor.py` importa tras manipular `sys.path` en tiempo de ejecución.
 *  · LO QUE A PROPÓSITO NO VIAJA: la foto de calentamiento. `servidor.py` busca
 *    un acta real en `assets/actas-demo` para calentar el grafo antes de
 *    `serve_forever()`; dentro del bundle no está, así que el sidecar del
 *    visitante arranca frío y la PRIMERA acta paga el recargo. Es lo que se
 *    quiere: un visitante que arranca el sidecar y no usa el lote no espera 5 s
 *    de más, y uno que lo usa lo paga una sola vez.
 *
 * Uso:
 *   node scripts/empaquetar-sidecar.mjs                 # build + arrancar + ZIP
 *   node scripts/empaquetar-sidecar.mjs --formato=onefile
 *   node scripts/empaquetar-sidecar.mjs --limpio        # venv + build/ + dist/
 *   node scripts/empaquetar-sidecar.mjs --sin-verificar
 *
 * La verificación NO es un `--help`: lanza el .exe en un puerto de prueba, le
 * hace `GET /salud` y comprueba que respondió con motor, sesiones, pid y
 * versión. Como el congelado solo puede hallar los modelos por la rama
 * `_MEIPASS`, que arranque YA es la prueba de que el `--add-data` aterrizó.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir, homedir } from "node:os";

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a) || [];
    return [m[1], m[2] === undefined ? true : m[2]];
  }),
);

const RAIZ = process.cwd();
const NOMBRE = String(argv.nombre ?? "supervision-e14-sidecar");
const ES_WINDOWS = process.platform === "win32";
// `onefile` = UN archivo de ~108 MiB que se DESCOMPRIME a %TEMP% en cada
// arranque; `onedir` = una carpeta con el exe adentro, que arranca sin
// descomprimir nada. El default se decidió midiendo (ver D81): el onefile
// tardaba ~17 s en contestar /salud y casi todo eso era la extracción.
const FORMATO = String(argv.formato ?? "onedir");
if (FORMATO !== "onefile" && FORMATO !== "onedir") {
  console.error(`[empaquetar] --formato debe ser onefile|onedir (llegó ${FORMATO})`);
  process.exit(2);
}
const EXE = join(
  RAIZ,
  "dist",
  ...(FORMATO === "onedir" ? [NOMBRE] : []),
  `${NOMBRE}${ES_WINDOWS ? ".exe" : ""}`,
);
const PUERTO_PRUEBA = Number(argv.puerto ?? 8799);
const DRY = Boolean(argv["dry-run"]);

// El venv vive FUERA del repo salvo en CI: en la máquina del dueño no queremos
// 300 MB de site-packages colándose en `git status`, y en el runner sí conviene
// que esté en el workspace para cachearlo.
const EN_CI = Boolean(process.env.CI);
const VENV = resolve(
  String(
    argv.venv ??
      (EN_CI
        ? join(RAIZ, ".venv-sidecar")
        : join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "e14-sidecar-pack", "venv")),
  ),
);
const PY = join(VENV, ES_WINDOWS ? "Scripts" : "bin", ES_WINDOWS ? "python.exe" : "python");
const PYINSTALLER = join(VENV, ES_WINDOWS ? "Scripts" : "bin", ES_WINDOWS ? "pyinstaller.exe" : "pyinstaller");

const log = (...a) => console.log(`[empaquetar]`, ...a);
const paso = (t) => log(`\n── ${t} ${"─".repeat(Math.max(0, 58 - t.length))}`);

function lanzar(cmd, args, opciones = {}) {
  if (DRY) {
    log(`(dry) ${cmd} ${args.join(" ")}`);
    return { code: 0, salida: "" };
  }
  const r = spawnSync(cmd, args, { cwd: RAIZ, stdio: opciones.mudo ? "ignore" : "inherit", encoding: "utf8" });
  return { code: r.status ?? 1, salida: r.stdout ?? "" };
}

if (!ES_WINDOWS) {
  console.error(
    `[empaquetar] PyInstaller NO cross-compila: el .exe de Windows se construye EN Windows.\n` +
      `[empaquetar] En Linux/macOS usa el workflow .github/workflows/sidecar-release.yml.\n`,
  );
  process.exit(2);
}

const pythonBase = String(argv.python || "python");
if (argv.limpio) {
  paso("limpieza");
  for (const p of [join(RAIZ, "build"), join(RAIZ, "dist"), VENV]) {
    if (existsSync(p)) {
      log(`rm -rf ${p}`);
      if (!DRY) rmSync(p, { recursive: true, force: true });
    }
  }
}

paso("venv");
if (!existsSync(PY)) {
  const r = lanzar(pythonBase, ["-m", "venv", VENV]);
  if (r.code !== 0) {
    console.error(`[empaquetar] no se pudo crear el venv en ${VENV}`);
    process.exit(1);
  }
}
log(`python: ${PY}`);
const sondear = (cmd, args) => (DRY ? "(dry)" : spawnSync(cmd, args, { encoding: "utf8" }).stdout?.trim());
const versionPy = sondear(PY, ["-c", "import sys;print('.'.join(map(str,sys.version_info[:3])))"]);
log(`versión ${versionPy}`);
if (!DRY && !versionPy) {
  console.error(`[empaquetar] el venv no tiene python funcional en ${PY}`);
  process.exit(1);
}

paso("dependencias");
// `requirements.txt` del sidecar + el empaquetador. Versiones fijadas por el
// propio requirements (medidas en el lote demo del D79).
let r = lanzar(PY, ["-m", "pip", "install", "--quiet", "--disable-pip-version-check", "-r", join("native", "requirements.txt"), "pyinstaller>=6.15"]);
if (r.code !== 0) {
  console.error(`[empaquetar] pip install falló — prueba \`bun run scripts/empaquetar-sidecar.mjs --limpio\`.`);
  process.exit(1);
}
const versionPI = sondear(PY, ["-c", "import PyInstaller;print(PyInstaller.__version__)"]);
log(`pyinstaller ${versionPI}`);

paso("construir");
const SEP = ES_WINDOWS ? ";" : ":";
const args = [
  "--noconfirm",
  "--clean",
  `--${FORMATO}`,
  "--console",
  "--name", NOMBRE,
  "--paths", join("native"),
  // Los modelos: `public/models/rapidocr` → `<MEIPASS>/models/rapidocr`. Se copia
  // la carpeta ENTERA (det/cls/rec + los .txt de diccionarios): `e14nativo.py`
  // arma las rutas por nombre y un diccionario suelto produce un OCR que arranca
  // y falla en la primera línea, que es el peor fallo posible para un visitante.
  "--add-data", `${join("public", "models", "rapidocr")}${SEP}${join("models", "rapidocr")}`,
  // `opencv` y `onnxruntime` traen .dll que PyInstaller resuelve por sus hooks,
  // pero `numpy` es histórico rompiéndose con los backend nuevos.
  "--hidden-import", "numpy",
  "--collect-submodules", "onnxruntime",
  join("native", "servidor.py"),
];
log(`pyinstaller ${args.join(" ")}`);
r = lanzar(PYINSTALLER, args);
if (DRY) {
  log("dry-run: nada se construyó");
  process.exit(0);
}
if (r.code !== 0 || !existsSync(EXE)) {
  console.error(`[empaquetar] el build no produjo ${EXE}`);
  process.exit(1);
}
// Tamaño del artefacto: en onefile es el exe; en onedir es la CARPETA entera
// (el exe solo pesa ~6 MiB y el número diría «faltan los modelos» a gritos).
function mibDe(ruta) {
  const st = statSync(ruta);
  if (!st.isDirectory()) return st.size / 1048576;
  let total = 0;
  for (const e of readdirSync(ruta, { withFileTypes: true })) {
    total += mibDe(join(ruta, e.name));
  }
  return total;
}
const mib = mibDe(FORMATO === "onedir" ? dirname(EXE) : EXE);
// Piso por formato: 108 MiB reales de onnxruntime+cv2+modelos, y un build al
// que le faltó el --add-data pesa la mitad. Mejor ruidos aquí que un exe que
// revienta en la máquina del visitante.
const PISO_MIB = FORMATO === "onefile" ? 40 : 90;
log(`${EXE} · ${mib.toFixed(1)} MiB (${FORMATO})`);
if (mib < PISO_MIB) {
  console.error(`[empaquetar] ⚠ ${mib.toFixed(1)} MiB es sospechosamente chico (piso ${PISO_MIB} para ${FORMATO}). Revisa el --add-data.`);
  process.exit(1);
}

if (argv["sin-verificar"] || DRY) {
  log("verificación saltada");
  process.exit(0);
}

paso("verificar arrancando el .exe");
// Con `cwd` en un temporal FUERA del repo: el congelado no puede ver
// `public/models`, así que si `/salud` contesta fue con los modelos del bundle.
// `--sesiones 2` es el default que va a ver el visitante; medir con 1 sería
// mentir en el número de arranque.
const cwdPrueba = join(tmpdir(), "e14-sidecar-prueba");
mkdirSync(cwdPrueba, { recursive: true });
const hijo = spawn(EXE, ["--puerto", String(PUERTO_PRUEBA), "--sesiones", "2"], { cwd: cwdPrueba, stdio: ["ignore", "pipe", "pipe"] });
let salidaHijo = "";
hijo.stdout?.on("data", (d) => (salidaHijo += d));
hijo.stderr?.on("data", (d) => (salidaHijo += d));

const t0 = Date.now();
let salud = null;
while (Date.now() - t0 < 120_000 && !salud) {
  if (hijo.exitCode !== null) break;
  try {
    const p = await fetch(`http://127.0.0.1:${PUERTO_PRUEBA}/salud`, { signal: AbortSignal.timeout(1500) });
    salud = await p.json();
  } catch {
    await new Promise((s) => setTimeout(s, 700));
  }
}
const msArranque = Date.now() - t0;

// taskkill /T, no `hijo.kill()`: en onefile el bootloader FORKA un hijo que
// hereda el stdout — matar solo el padre deja un sidecar huérfano escuchando y
// una tubería abierta que nunca da EOF.
if (hijo.exitCode === null) {
  spawnSync("taskkill", ["/PID", String(hijo.pid), "/T", "/F"], { stdio: "ignore" });
}
await new Promise((s) => setTimeout(s, 500));

if (!salud || salud.ok !== true) {
  console.error(`[empaquetar] ✘ el .exe NO respondió /salud en ${msArranque} ms`);
  console.error(salidaHijo.slice(-2000));
  process.exit(1);
}
for (const campo of ["motor", "sesiones", "pid", "version"]) {
  if (salud[campo] === undefined) {
    console.error(`[empaquetar] ✘ /salud sin el campo ${campo}: ${JSON.stringify(salud)}`);
    process.exit(1);
  }
}
log(`/salud en ${msArranque} ms · ${JSON.stringify(salud)}`);
// Techo honesto: el congelado NO encuentra la foto de calentamiento (vive en
// `assets/actas-demo`, fuera del bundle), así que `/salud` contesta SIN el
// grafo caliente y la PRIMERA acta del visitante paga ese recargo. Es
// deliberado — ver D81 — y por eso el arranque medido aquí es el del proceso,
// no el del lote.
//
// El número de ESTA corrida no es el que ve el visitante en steady state: tras
// escribir la carpeta, el primer arranque paga además el escaneo de Defender
// (medido: 12,5 s la primera vez sobre el dist recién creado vs 4,5-6,3 s en
// las tres corridas siguientes). No se puede poner un gate duro en algo que
// depende del antivirus del runner; se declara.
if (msArranque > 60_000) {
  console.error(
    `[empaquetar] ✘ ${Math.round(msArranque / 1000)} s hasta /salud: esto ya no es ` +
      `antivirus, es un build que no arranca (o un --add-data que no aterrizó).`,
  );
  console.error(salidaHijo.slice(-2000));
  process.exit(1);
}
if (msArranque > 12_000) {
  log(
    `⚠ ${Math.round(msArranque / 1000)} s en EL PRIMER arranque (Defender escanea los ` +
      `239 MiB recién escritos). En las corridas siguientes se mide 4,5-6,3 s; con ` +
      `--onefile serían 16,7-18,1 s SIEMPRE.`,
  );
}

paso("comprimir para distribuir");
// Se distribuye la CARPETA en ZIP, no el .exe de un archivo: medidos back-to-
// back en el mismo equipo, la descarga es prácticamente la misma (108,4 MiB
// comprimido vs 108,1 MiB del onefile) y el arranque es 3,3× más corto
// (4,5-6,3 s vs 16,7-18,1 s). El costo que se acepta es un paso más para el
// visitante — «descomprime y ejecuta el de adentro» — y que ocupe 239 MiB en
// disco en vez de 108.
const ZIP = join(RAIZ, "dist", `${NOMBRE}-win-x64.zip`);
if (ES_WINDOWS && FORMATO === "onedir") {
  if (existsSync(ZIP)) rmSync(ZIP);
  const ps = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${dirname(EXE)}' -DestinationPath '${ZIP}' -CompressionLevel Optimal`,
    ],
    { stdio: "inherit", cwd: RAIZ },
  );
  if (ps.status !== 0 || !existsSync(ZIP)) {
    console.error(`[empaquetar] ✘ no se produjo ${ZIP}`);
    process.exit(1);
  }
  log(`${ZIP} · ${(statSync(ZIP).size / 1048576).toFixed(1)} MiB`);
}

log(
  `OK · ${NOMBRE} · ${FORMATO} · ${mib.toFixed(1)} MiB en disco` +
    `${existsSync(ZIP) ? ` · ${(statSync(ZIP).size / 1048576).toFixed(1)} MiB de descarga` : ""} · ` +
    `${msArranque} ms a /salud · motor ${salud.motor} · ${salud.version}`,
);
