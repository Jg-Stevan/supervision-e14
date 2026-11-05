/**
 * QA headless — contrato e14-core-vendorizado-v1: el motor de escaneo vendorizado
 * (`core/` bajo el módulo `e14/` de este repo) es COPIA LOCAL del paquete
 * `@jg-stevan/scanner-core`, como el del repo hermano del dominio (ver
 * `core/LEEME.md`). Al no ser ya una dependencia de npm, la paridad entre los
 * dos productos deja de darla la versión instalada: la da este harness.
 *
 *   bun scripts/qa-core-vendorizado.ts            # verificar
 *   bun scripts/qa-core-vendorizado.ts --generar  # tras editar el motor, en los DOS repos
 *
 * Regla: los módulos que existen en los DOS repos tienen que ser **byte a byte
 * idénticos**. No hay lista blanca de diferencias — si el motor diverge, dos
 * puestos leen un acta distinto y eso es justamente lo que el dominio no puede
 * permitir. Un arreglo del motor que afecte la lectura se aplica a las dos
 * copias en el mismo commit.
 *
 * Los chequeos 1 y 5 necesitan el hermano en disco (el CI de GitHub solo clona
 * un repo, así que ahí salen con «omitido» explícito, igual que
 * `qa-paridad-motor.ts`). El 5 —`core/CONTRATO.json`— es el que sí persigue la
 * divergencia en cada CI por separado.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let pasadas = 0;
let fallos = 0;
function ok(cond: boolean, etiqueta: string): void {
  console.log(`${cond ? "OK" : "FAIL"} · ${etiqueta}`);
  pasadas++;
  if (!cond) fallos++;
}

const CORE_AQUI = join(RAIZ, "src", "modules", "digitalizador", "lib", "e14", "core");
const HERMANO = process.env.E14_HERMANO ?? join(RAIZ, "..", "digielect14");
const CORE_HERMANO = join(HERMANO, "src", "lib", "e14", "core");
// La capa React vendorizada (ZoomableVisor) solo existe en el móvil: el visor
// del panel es propio y no importa el paquete. En el hermano este árbol está
// ausente y el chequeo 6 sale con «omitido» explícito.
const UI_AQUI = join(RAIZ, "src", "modules", "digitalizador", "lib", "e14", "ui");

// El contrato fija el CONTENIDO del motor, no sus finales de línea: el índice y
// el CI (Linux) van en LF y `.gitattributes` lo fuerza, pero un editor puede
// regrabar CRLF acá. Un md5 sobre bytes crudos cortaría el CI por un EOL.
const SIN_CR = (b: Buffer | string): string =>
  (typeof b === "string" ? b : b.toString("utf8")).replace(/\r\n/g, "\n");
const md5 = (b: Buffer | string): string => createHash("md5").update(SIN_CR(b)).digest("hex");

const modulos = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".ts"))
        .sort()
    : [];

const propios = modulos(CORE_AQUI);
ok(propios.length > 0, `core vendorizado presente (${propios.length} módulos)`);

// ---------- 1 · byte a byte contra el hermano ----------

if (!existsSync(CORE_HERMANO)) {
  console.log(
    `OK · omitido — no hay core hermano en ${CORE_HERMANO} (E14_HERMANO para señalarlo).\n` +
      `     En CI este paso no corre; la paridad del negocio la sostiene el golden de qa-paridad-motor.ts.`,
  );
} else {
  const delHermano = modulos(CORE_HERMANO);
  const compartidos = propios.filter((f) => delHermano.includes(f));
  ok(
    compartidos.length > 0,
    `módulos compartidos con el hermano: ${compartidos.length} [${compartidos.join(" ")}]`,
  );
  for (const f of compartidos) {
    const a = readFileSync(join(CORE_AQUI, f));
    const b = readFileSync(join(CORE_HERMANO, f));
    ok(
      md5(a) === md5(b),
      `${f} idéntico en los dos repos [${md5(a).slice(0, 8)} · ${a.length} bytes]`,
    );
  }
  // Un módulo puede existir en un repo y no en el otro (el móvil lleva cámara y
  // calidad; el panel no). Lo que NO puede pasar es que el hermano tenga un
  // módulo que aquí se importe sin tenerlo → lo cubre el chequeo 2.
  console.log(
    `     solo aquí: ${propios.filter((f) => !delHermano.includes(f)).join(" ") || "—"}`,
  );
  console.log(
    `     solo allá: ${delHermano.filter((f) => !propios.includes(f)).join(" ") || "—"}`,
  );
}

// ---------- 2 · cierre interno: todo import relativo existe ----------

let rotos = 0;
const pendientes = new Set<string>();
for (const f of propios) {
  const txt = readFileSync(join(CORE_AQUI, f), "utf8");
  for (const m of txt.matchAll(/from\s+"(\.\/[^"]+)"/g)) {
    const destino = join(CORE_AQUI, m[1] + ".ts");
    if (!existsSync(destino)) {
      rotos++;
      pendientes.add(`${f} → ${m[1]}`);
    }
  }
}
ok(rotos === 0, `cierre interno del core (${rotos} imports colgando)${rotos ? `: ${[...pendientes].join(", ")}` : ""}`);

// ---------- 3 · el paquete ya no debe estar referenciado ----------

const areas = ["src", "scripts"];
const ESPECIFICADOR_CORE =
  /\b(?:from|import|require|mock\.module|vi\.mock)\s*\(?\s*["']@jg-stevan\/scanner-(?:core|ui)/;
const referencias: string[] = [];
for (const area of areas) {
  const dir = join(RAIZ, area);
  if (!existsSync(dir)) continue;
  const caminar = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "core") continue;
        caminar(join(d, e.name));
      } else if (/\.(ts|tsx|mjs)$/.test(e.name)) {
        // Este propio harness cita la cadena para buscarla; no es un import.
        if (e.name === "qa-core-vendorizado.ts") continue;
        const txt = readFileSync(join(d, e.name), "utf8");
        // La cadena vive en prosa de comentarios, en el LEEME y en el ancla
        // negativa de qa-paridad-motor.ts (que prohíbe declararla). Solo se
        // castiga la posición de ESPECIFICADOR de módulo: lo que resolvería el
        // bundler, no lo que un test puede citar para vetarlo.
        if (ESPECIFICADOR_CORE.test(txt)) referencias.push(join(d, e.name));
      }
    }
  };
  caminar(dir);
}
ok(
  referencias.length === 0,
  `ningún import apunta a "@jg-stevan/scanner-core" ni "-ui" (${referencias.length} archivos)${referencias.length ? `: ${referencias.join(", ")}` : ""}`,
);

const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
ok(
  !("@jg-stevan/scanner-core" in deps),
  'el paquete "@jg-stevan/scanner-core" ya no está en package.json',
);
ok(
  !("@jg-stevan/scanner-ui" in deps),
  'el paquete "@jg-stevan/scanner-ui" ya no está en package.json',
);

// ---------- 4 · procedencia declarada ----------

const leeme = join(CORE_AQUI, "LEEME.md");
if (existsSync(leeme)) {
  const txt = readFileSync(leeme, "utf8");
  const commit = txt.match(/`([0-9a-f]{40})`/)?.[1] ?? "";
  ok(commit.length === 40, `LEEME.md nombra el commit de origen (${commit.slice(0, 8) || "sin hash"})`);
  if (existsSync(CORE_HERMANO)) {
    const txtH = readFileSync(join(CORE_HERMANO, "LEEME.md"), "utf8");
    const commitH = txtH.match(/`([0-9a-f]{40})`/)?.[1] ?? "";
    ok(commit === commitH, "los dos LEEME declaran el mismo commit de origen");
  }
  ok(existsSync(join(CORE_AQUI, "LICENSE-scanner-core.md")), "el texto MIT del origen está conservado");
} else {
  ok(false, "falta core/LEEME.md con la procedencia");
}

// ---------- 5 · CONTRATO.json: la paridad que SÍ corre en CI ----------
//
// El chequeo 1 necesita el hermano en disco; GitHub Actions solo clona un repo.
// `core/CONTRATO.json` fija el md5 de cada módulo vendorizado y se commitea en
// los DOS repos, así que cada CI puede exigir que SU motor sigue siendo el que
// era. Si alguien edita el motor, el contrato se pone rojo hasta que se
// regenera y se propaga la misma edición al otro repo.
//
//   bun scripts/qa-core-vendorizado.ts --generar

const CONTRATO = join(CORE_AQUI, "CONTRATO.json");
const generar = process.argv.includes("--generar");
const hashes = Object.fromEntries(
  propios.map((f) => [f, md5(readFileSync(join(CORE_AQUI, f)))]),
);
const compartidosAqui = propios.filter((f) => existsSync(join(CORE_HERMANO, f)));

if (generar) {
  const cuerpo =
    JSON.stringify(
      {
        "//": "md5 de cada módulo de core/ — ver LEEME.md. Regenerar con `bun scripts/qa-core-vendorizado.ts --generar` y propagar al otro repo la misma edición del motor.",
        origen: {
          repo: "Jg-Stevan/web-scanner",
          commit: "feba267cb9c01a896f0135ed2e406b7567bec663",
          version: "0.4.1",
        },
        compartidos: compartidosAqui,
        modulos: hashes,
      },
      null,
      2,
    ) + "\n";
  writeFileSync(CONTRATO, cuerpo);
  console.log(`OK · CONTRATO.json generado (${Object.keys(hashes).length} módulos)`);
} else if (!existsSync(CONTRATO)) {
  ok(false, "falta core/CONTRATO.json (generar con --generar)");
} else {
  const contrato = JSON.parse(readFileSync(CONTRATO, "utf8")) as {
    modulos: Record<string, string>;
    compartidos: string[];
  };
  const nombres = Object.keys(contrato.modulos).sort();
  ok(
    nombres.join(" ") === propios.join(" "),
    `CONTRATO lista los mismos módulos del árbol (${nombres.length} vs ${propios.length})`,
  );
  const divergentes = nombres.filter(
    (f) => existsSync(join(CORE_AQUI, f)) && md5(readFileSync(join(CORE_AQUI, f))) !== contrato.modulos[f],
  );
  ok(
    divergentes.length === 0,
    `cada módulo pesa lo que declara el contrato${divergentes.length ? ` — EDITADO SIN PROPAGAR: ${divergentes.join(" ")}` : ""}`,
  );
  if (existsSync(CORE_HERMANO) && existsSync(join(CORE_HERMANO, "CONTRATO.json"))) {
    const cH = JSON.parse(readFileSync(join(CORE_HERMANO, "CONTRATO.json"), "utf8")) as {
      modulos: Record<string, string>;
    };
    const distintos = nombres.filter(
      (f) => cH.modulos[f] !== undefined && cH.modulos[f] !== contrato.modulos[f],
    );
    ok(
      distintos.length === 0,
      `los dos CONTRATO coinciden donde se solapan${distintos.length ? `: ${distintos.join(" ")}` : ""}`,
    );
  }
}

// ---------- 6 · la capa UI vendorizada (existe solo donde se copia) ----------
//
// Mismo mecanismo que el 5, sobre `ui/`: fija que el visor que se editó en el
// repo sigue siendo el que se documentó. Donde no hay `ui/` (el panel) el
// chequeo sale «omitido» explícito — el harness es idéntico en los dos repos
// salvo por las constantes de ruta.

const archivosUI = existsSync(UI_AQUI)
  ? readdirSync(UI_AQUI)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .sort()
  : [];
const CONTRATO_UI = join(UI_AQUI, "CONTRATO.json");

if (archivosUI.length === 0) {
  console.log(
    "OK · omitido — este repo no vendoriza la capa UI (su visor es propio).\n",
  );
} else if (generar) {
  const cuerpo =
    JSON.stringify(
      {
        "//": "md5 de cada archivo de ui/ — ver LEEME.md. Regenerar con `bun scripts/qa-core-vendorizado.ts --generar`.",
        origen: {
          repo: "Jg-Stevan/web-scanner",
          commit: "feba267cb9c01a896f0135ed2e406b7567bec663",
          version: "0.1.0",
        },
        modulos: Object.fromEntries(
          archivosUI.map((f) => [f, md5(readFileSync(join(UI_AQUI, f)))]),
        ),
      },
      null,
      2,
    ) + "\n";
  writeFileSync(CONTRATO_UI, cuerpo);
  console.log(`OK · ui/CONTRATO.json generado (${archivosUI.length} archivos)`);
} else {
  ok(true, `ui/ vendorizada presente (${archivosUI.length} archivos)`);
  ok(existsSync(CONTRATO_UI), "ui/CONTRATO.json existe (generar con --generar)");
  if (existsSync(CONTRATO_UI)) {
    const c = JSON.parse(readFileSync(CONTRATO_UI, "utf8")) as {
      modulos: Record<string, string>;
    };
    const nombres = Object.keys(c.modulos).sort();
    ok(
      nombres.join(" ") === archivosUI.join(" "),
      `ui/CONTRATO lista los mismos archivos del árbol (${nombres.length} vs ${archivosUI.length})`,
    );
    const movidos = nombres.filter(
      (f) => existsSync(join(UI_AQUI, f)) && md5(readFileSync(join(UI_AQUI, f))) !== c.modulos[f],
    );
    ok(
      movidos.length === 0,
      `cada archivo de ui/ pesa lo que declara su contrato${movidos.length ? ` — EDITADO SIN REGENERAR: ${movidos.join(" ")}` : ""}`,
    );
  }
  const leemeUI = join(UI_AQUI, "LEEME.md");
  ok(existsSync(leemeUI), "ui/LEEME.md existe con la procedencia");
  ok(
    existsSync(join(UI_AQUI, "LICENSE-scanner-ui.md")),
    "el texto MIT del origen de la capa UI está conservado",
  );
  if (existsSync(leemeUI) && existsSync(join(CORE_AQUI, "LEEME.md"))) {
    const commitUI =
      readFileSync(leemeUI, "utf8").match(/`([0-9a-f]{40})`/)?.[1] ?? "";
    const commitCore =
      readFileSync(join(CORE_AQUI, "LEEME.md"), "utf8").match(/`([0-9a-f]{40})`/)?.[1] ?? "";
    ok(
      commitUI.length === 40 && commitUI === commitCore,
      `la capa UI y el motor declaran el mismo commit de origen (${commitUI.slice(0, 8) || "sin hash"})`,
    );
  }
  // Tailwind v4 genera las clases del visor desde el build del consumidor: sin
  // la línea @source el componente se ve DESNUDO y el fallo es silencioso.
  const css = join(RAIZ, "src", "app", "globals.css");
  if (existsSync(css)) {
    const txt = readFileSync(css, "utf8");
    ok(
      /@source\s+"[^"]*lib\/e14\/ui"/.test(txt) && !/@source\s+"[^"]*scanner-ui/.test(txt),
      "globals.css apunta @source al árbol ui/ vendorizado (no al paquete npm)",
    );
  }
}

console.log(`\n${pasadas - fallos}/${pasadas} chequeos · ${fallos} hallazgos`);
process.exit(fallos ? 1 : 0);

