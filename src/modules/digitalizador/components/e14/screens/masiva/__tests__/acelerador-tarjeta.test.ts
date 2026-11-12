/**
 * KIT e14-sidecar-instalable-v1 (D81) — contrato de la tarjeta ACELERADOR NATIVO.
 *
 * La tarjeta es UI con efectos (el sondeo vive en un `useEffect`), así que
 * `renderToStaticMarkup` solo pintaría el primer frame. Se prueba lo que SÍ es
 * comprobable y lo que realmente puede romperse en silencio:
 *
 *  1) EL NOMBRE DEL ASSET, a tres bandas: la URL de la tarjeta, el archivo que
 *     sube el workflow y el `--name` de PyInstaller. Si uno de los tres se
 *     mueve, el botón queda en un 404 de GitHub — y un link roto no lanza nada,
 *     no se loguea, no se ve. Es el único fallo de esta tarjeta que no deja
 *     rastro.
 *  2) El botón REINTENTAR corta la memoria del sondeo. Sin
 *     `invalidarSondaNativo()` el click releería un `ok:false` de hasta 15 s y
 *     la tarjeta diría «ausente» delante de un sidecar ya vivo.
 *  3) La tarjeta NO manda en el pipeline: no puede condicionar el lote. Se fija
 *     por import — si alguien le cuelga un gate, esto revienta.
 *  4) El «qué debes ver» de los docs es literalmente lo que imprime
 *     `servidor.py`. Un visitante que no ve la línea anunciada cierra la ventana
 *     creyendo que falló; y el README llegó a anunciar una línea que el código
 *     nunca imprimió.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { URL_DESCARGA_SIDECAR } from "../acelerador";

const RAIZ = join(import.meta.dir, "../../../../../../../../");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

/** El nombre de archivo que la app espera descargar. */
const ARCHIVO = new URL(URL_DESCARGA_SIDECAR).pathname.split("/").pop()!;

describe("acelerador — tarjeta del sidecar", () => {
  test("la URL es la de la release `latest` (sin versión fija)", () => {
    // `/releases/latest/download/` es lo único que sobrevive a una nueva
    // release sin recompilar la app.
    expect(URL_DESCARGA_SIDECAR).toContain("/releases/latest/download/");
    expect(ARCHIVO).toBe("supervision-e14-sidecar-win-x64.zip");
  });

  test("el empaquetador produce exactamente ese ZIP (--nombre + sufijo)", () => {
    const fuente = leer("scripts/empaquetar-sidecar.mjs");
    const m = /argv\.nombre\s*\?\?\s*"([^"]+)"/.exec(fuente);
    expect(m).not.toBeNull();
    // El literal del ZIP tiene que ser `${NOMBRE}-win-x64.zip`; si alguien le
    // cambia el sufijo o la extensión, el link de la tarjeta queda en 404.
    expect(fuente).toContain("${NOMBRE}-win-x64.zip");
    expect(`${m![1]}-win-x64.zip`).toBe(ARCHIVO);
  });

  test("el workflow sube exactamente ese asset a la release", () => {
    const yml = leer(".github/workflows/sidecar-release.yml");
    expect(yml).toContain(`dist/${ARCHIVO}`);
    // `gh release upload/create` con el path: el nombre del asset es el basename.
    expect(yml).toMatch(/gh release (create|upload) "\$TAG" "\$ZIP"/);
  });

  test("el default empaquetado es onedir, no onefile", () => {
    // Medido: el onefile paga ~12 s de extracción en CADA arranque por el mismo
    // tamaño de descarga. Regresionar a onefile es lento y silencioso.
    const fuente = leer("scripts/empaquetar-sidecar.mjs");
    expect(fuente).toMatch(/argv\.formato\s*\?\?\s*"onedir"/);
  });

  test("el reintento corta la memoria del sondeo", () => {
    const fuente = leer(
      "src/modules/digitalizador/components/e14/screens/masiva/acelerador.tsx",
    );
    expect(fuente).toMatch(/invalidarSondaNativo/);
    // El botón existe y es el camino explícito del visitante que ya instaló.
    expect(fuente).toMatch(/REINTENTAR/);
    expect(fuente).toMatch(/sondear\(true\)/);
  });

  test("P-21 — el re-sondeo vive SIEMPRE (activo/caído incluidos), no solo en ausente", () => {
    // La deuda §5.3 (DEUDA P0): el timer solo corría en AUSENTE y un sidecar
    // que moría a mitad de sesión quedaba ACTIVO para siempre, sin aviso ni
    // re-sondeo. El efecto del intervalo no puede volver a filtrar por estado.
    const fuente = leer(
      "src/modules/digitalizador/components/e14/screens/masiva/acelerador.tsx",
    );
    expect(fuente).not.toMatch(/estado\s*!==\s*"ausente"\s*\)?\s*return/);
    expect(fuente).toMatch(/window\.setInterval\(\(\) => void sondear\(true\), REINTENTO_MS\)/);
  });

  test("P-21 — 2 fallos seguidos desarmar el flag EN RUNTIME y estado CAÍDO con banner", () => {
    const fuente = leer(
      "src/modules/digitalizador/components/e14/screens/masiva/acelerador.tsx",
    );
    // Dos sondeos fallidos seguidos (no uno: un timeout suelto no condena).
    expect(fuente).toMatch(/FALLOS_PARA_CAIDA\s*=\s*2/);
    expect(fuente).toMatch(/fallosRef\.current >= FALLOS_PARA_CAIDA/);
    // El desarme es EN RUNTIME: el override persistido (localStorage/flags.json)
    // NO se toca — persistir `ocrNativoUrl: null` mataría la tarjeta para
    // siempre (url null → return null) y el visitante tendría que limpiar el
    // override a mano tras reiniciar el .exe.
    expect(fuente).toMatch(/configurarNativo\(null\)/);
    expect(fuente).not.toMatch(/guardarOverridesFlags|localStorage\.setItem/);
    // El estado y su banner visible (role="alert") — «OCR continúa por WASM».
    expect(fuente).toMatch(/"caido"/);
    expect(fuente).toMatch(/role="alert"/);
    expect(fuente).toMatch(/OCR contin[úu]a por WASM/);
  });

  test("P-21 — la recuperación re-arma el motor (sondeo DIRECTO, no a ciegas)", () => {
    const fuente = leer(
      "src/modules/digitalizador/components/e14/screens/masiva/acelerador.tsx",
    );
    // En CAÍDO se sondea la URL original DIRECTO (el flag runtime está null y
    // la sonda del core contestaría false sin salir a la red).
    expect(fuente).toMatch(/sondearUrlSidecarDirecta/);
    // Y al responder, el runtime se re-arma con la URL original.
    expect(fuente).toMatch(/configurarNativo\(url\)/);
    const nativo = leer("src/modules/digitalizador/lib/e14/ocr/nativo.ts");
    expect(nativo).toMatch(/sondearUrlSidecarDirecta/);
    // Mismo contrato que la sonda del core: jamás lanza.
    expect(nativo).toMatch(/catch\s*\{\s*return false/);
  });

  test("la tarjeta es informativa: no importa el runner ni el gate", () => {
    const fuente = leer(
      "src/modules/digitalizador/components/e14/screens/masiva/acelerador.tsx",
    );
    for (const prohibido of ["runner", "gate", "store-e14", "politica"]) {
      expect(fuente).not.toMatch(new RegExp(`from [^"]*${prohibido}`));
    }
  });

  test("está montada en el sidebar de CARGA MASIVA", () => {
    const fuente = leer(
      "src/modules/digitalizador/components/e14/screens/masiva/orquestador.tsx",
    );
    expect(fuente).toMatch(/import \{ AceleradorNativo \} from "\.\/acelerador"/);
    expect(fuente).toMatch(/<AceleradorNativo \/>/);
  });

  test("el href apunta al repo remoto real (no a un placeholder)", () => {
    const git = leer(".git/config");
    // `git remote add` y `actions/checkout` escriben la URL sin `.git`; exigir el
    // sufijo hacía esta ancla falsa-dependiente de la forma de la URL (y roja en CI).
    const remoto =
      /url\s*=\s*https:\/\/github\.com\/([^/\s]+)\/([^\s/]+?)(?:\.git)?\s*$/m.exec(git);
    expect(remoto).not.toBeNull();
    expect(URL_DESCARGA_SIDECAR).toContain(`github.com/${remoto![1]}/${remoto![2]}`);
  });

  test("el «qué debes ver» de los docs es lo que realmente imprime servidor.py", () => {
    // Separador entre sesiones e hilos, tomado del `print` del servidor (medido
    // ejecutando el .exe congelado: «2 sesión(es) × 2 hilos»).
    const sep = /sesión\(es\) (\S)/.exec(leer("native/servidor.py"))?.[1];
    expect(sep).toBe("×");
    for (const doc of ["native/README.md", "docs/RUNBOOK-sidecar-instalable-v1.md"]) {
      const d = leer(doc);
      expect(d).toContain(`sesión(es) ${sep} `);
      // El separador equivocado ES el fallo: el README llegó a anunciar una
      // línea que el servidor nunca imprime.
      expect(d).not.toContain(`sesión(es) · `);
      // El congelado no calienta: la línea `LISTO` del visitante dice esto, y el
      // doc tiene que decirlo o el lector espera algo que nunca llega.
      expect(d).toContain("sin acta de ejemplo: no calentada");
      // Línea que el README anunciaba y el servidor jamás imprimió.
      expect(d).not.toContain("listo en http://");
    }
  });
});
