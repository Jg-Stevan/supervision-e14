import { memo } from "react";
// R9 (ola-3) — ADOPCIÓN de los exports canónicos (M13/R3):
// delegadosAcreditados y ciudadDePuesto viven en domain/acta.ts (regla
// ÚNICA); las copias locales que había aquí (antes L31-45) se ELIMINAN.
// Los tests de paridad que congelaban la duplicación ahora verifican la
// adopción (data/__tests__/validacion-d25.test.ts).
import {
  ciudadDePuesto,
  crearRandomDeterministico,
  delegadosAcreditados,
} from "../../domain/acta";
import type { ActaMesa, FormularioTipo } from "../../domain/acta";
import type { Mesa, Puesto } from "../../domain/types";

/**
 * Documento E-14 SINTÉTICO (kit SUP-4 §2.3 / D18): papel A4 vectorial
 * dibujado con JSX/SVG — SIN assets binarios (§0-8): sin PNG/JPG, sin
 * PDFs, sin pdf.js, sin iframes. Las 3 variantes de página:
 * - TRANSMISIÓN P1 — Formulario de transmisión de resultados (tabla de votos).
 * - TRANSMISIÓN P2 — Hoja de firmas y validación (sello de anomalía si el
 *   acta tiene ADVERTENCIA en página 2).
 * - DELEGADOS — Acta de acreditación de delegados (folio único).
 *
 * Los colores del PAPEL no son tokens de UI: viven SOLO aquí (excepción
 * acotada del kit §2.1). Props puras + memo; el zoom/rotación/contraste
 * viven en el contenedor del visor (T4), no aquí.
 */

// Paleta del documento (excepción acotada D18 — no usar fuera de este papel).
const PAPEL = "#f7f6f2";
const TINTA = "#1c1c1c";
const LINEA = "#c9c5ba";
const SELLO = "#b3261e";

const ANCHO = 794;
const ALTO = 1123;

const PARTIDOS = [
  "MOVIMIENTO UNIDAD",
  "FRENTE POPULAR",
  "ALIANZA VERDE",
  "PARTIDO LIBERAL",
  "CONSERVADOR UNIDO",
  "VOTO EN BLANCO",
] as const;

/** Votos determinísticos por seed de mesa; TOTAL = suma exacta (§4.5). */
function votosDeActa(acta: ActaMesa): number[] {
  const random = crearRandomDeterministico(
    `${acta.puestoId}::${acta.mesaId}::votos`
  );
  return PARTIDOS.map(() => 30 + Math.floor(random() * 390));
}

const NOMBRES_DELEGADOS = [
  "MARÍA FERNANDA QUIROGA",
  "JUAN PABLO RESTREPO",
  "LUCÍA VALENTINA OSORIO",
  "CARLOS ANDRÉS BETANCUR",
  "ANA SOFÍA DELGADO",
  "PEDRO LUIS CIFUENTES",
  "VALENTINA CARDONA",
  "ANDRÉS FELIPE MEJÍA",
  "CARMEN ROSA IBARRA",
  "JULIÁN ESTEBAN RICO",
  "DIANA CAROLINA PARDO",
  "ÓSCAR IVÁN SALAZAR",
  "HELENA MÁRQUEZ",
  "FELIPE SANTIAGO VARGAS",
  "PAULA ANDREA NIETO",
  "RICARDO EMILIO LOZANO",
] as const;

/** Permutación determinística de la lista de nombres por seed. */
function nombresDeMesa(acta: ActaMesa): string[] {
  const random = crearRandomDeterministico(
    `${acta.puestoId}::${acta.mesaId}::delegados`
  );
  const lista = [...NOMBRES_DELEGADOS];
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

const ROLES_FIRMA = [
  "Testigo 1",
  "Testigo 2",
  "Testigo 3",
  "Testigo 4",
  "Fiscal de mesa",
  "Presidente de mesa",
] as const;

/** Trazo de firma ondulado determinístico por seed (SVG path). */
function trazoFirma(acta: ActaMesa, indice: number): string {
  const random = crearRandomDeterministico(
    `${acta.puestoId}::${acta.mesaId}::firma-${indice}`
  );
  let x = 8;
  let y = 30 + Math.floor(random() * 10);
  let d = `M ${x} ${y}`;
  for (let s = 0; s < 5; s++) {
    const dx = 18 + Math.floor(random() * 14);
    const c1x = x + dx * 0.4;
    const c1y = y - (8 + Math.floor(random() * 16));
    const c2x = x + dx * 0.7;
    const c2y = y + (8 + Math.floor(random() * 16));
    x += dx;
    y = 26 + Math.floor(random() * 14);
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x} ${y}`;
  }
  return d;
}

/** Texto determinístico del cuadro de observaciones (3 líneas). */
function textoObservaciones(acta: ActaMesa): string[] {
  const random = crearRandomDeterministico(
    `${acta.puestoId}::${acta.mesaId}::obs`
  );
  const opciones = [
    "Acta recibida conforme al formato E-14 vigente.",
    "Numeración de renglones verificada en la carga.",
    "Credencial coincide con el registro de la mesa.",
    "Transmisión revisada por el delegado de sistema.",
    "Cierre de mesa reportado dentro de la ventana.",
    "Consistencia aritmética del consolidado verificada.",
  ];
  const inicio = Math.floor(random() * opciones.length);
  return [0, 1, 2].map((i) => opciones[(inicio + i) % opciones.length]);
}

// ─── Piezas compartidas del papel ───────────────────────────────────────────

function CeldaId({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
      <span
        className="text-[9px] font-bold uppercase tracking-[0.08em]"
        style={{ color: "#6b6b63" }}
      >
        {etiqueta}
      </span>
      <span
        className="font-data truncate text-[12px] font-medium"
        style={{ color: TINTA }}
      >
        {valor}
      </span>
    </div>
  );
}

function PiePagina({ texto }: { texto: string }) {
  return (
    <div
      className="absolute inset-x-0 bottom-5 text-center text-[10px] font-bold uppercase tracking-[0.14em]"
      style={{ color: "#6b6b63" }}
    >
      {texto}
    </div>
  );
}

// ─── TRANSMISIÓN · PÁGINA 1 ─────────────────────────────────────────────────

function PaginaTransmision1({
  mesa,
  acta,
  puesto,
}: {
  mesa: Mesa;
  acta: ActaMesa;
  puesto: Puesto;
}) {
  const votos = votosDeActa(acta);
  const total = votos.reduce((suma, v) => suma + v, 0);
  const acreditados = delegadosAcreditados(mesa);
  return (
    <>
      {/* Banda de cabecera */}
      <div
        className="border-b-2 px-8 pb-5 pt-10 text-center"
        style={{ borderColor: TINTA }}
      >
        <p
          className="text-[19px] font-bold uppercase tracking-[0.04em]"
          style={{ color: TINTA }}
        >
          Formulario E-14 — Transmisión de Resultados
        </p>
        <p
          className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "#6b6b63" }}
        >
          Resultados Voto Exterior — Cierre de Mesa
        </p>
      </div>

      {/* Bloque de identificación (tabla 2×4, líneas #c9c5ba) */}
      <div
        className="mx-8 mt-6 grid grid-cols-4 overflow-hidden rounded-[2px] border"
        style={{ borderColor: LINEA }}
      >
        <CeldaId
          etiqueta="Delegación"
          valor={`${puesto.pais.toUpperCase()} — ${ciudadDePuesto(puesto)}`}
        />
        <CeldaId etiqueta="Puesto" valor={puesto.puesto.toUpperCase()} />
        <CeldaId etiqueta="Mesa" valor={acta.mesaId} />
        <CeldaId etiqueta="Credencial" valor={acta.id} />
        <div className="col-span-4 border-t" style={{ borderColor: LINEA }}>
          <CeldaId
            etiqueta="Fecha / hora de carga del acta"
            valor={acta.horaCarga}
          />
        </div>
      </div>

      {/* Tabla de votos */}
      <div className="mx-8 mt-6">
        <p
          className="text-[12px] font-bold uppercase tracking-[0.1em]"
          style={{ color: TINTA }}
        >
          Recuento de votos por partido
        </p>
        <table className="mt-2 w-full border-collapse">
          <thead>
            <tr>
              <th
                className="border-y px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em]"
                style={{ borderColor: LINEA, color: "#6b6b63" }}
              >
                Partido
              </th>
              <th
                className="w-32 border-y px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.1em]"
                style={{ borderColor: LINEA, color: "#6b6b63" }}
              >
                Votos
              </th>
            </tr>
          </thead>
          <tbody>
            {PARTIDOS.map((partido, i) => (
              <tr key={partido}>
                <td
                  className="border-b px-3 py-2.5 text-[13px] font-semibold"
                  style={{ borderColor: LINEA, color: TINTA }}
                >
                  {partido}
                </td>
                <td
                  className="font-data border-b px-3 py-2.5 text-right text-[13px]"
                  style={{ borderColor: LINEA, color: TINTA }}
                >
                  {votos[i]}
                </td>
              </tr>
            ))}
            <tr>
              <td
                className="border-b-2 px-3 py-2.5 text-[13px] font-bold uppercase tracking-[0.06em]"
                style={{ borderColor: TINTA, color: TINTA }}
              >
                Total
              </td>
              <td
                className="font-data border-b-2 px-3 py-2.5 text-right text-[13px] font-bold"
                style={{ borderColor: TINTA, color: TINTA }}
              >
                {total}
              </td>
            </tr>
          </tbody>
        </table>

        <p
          className="mt-5 text-[12px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: TINTA }}
        >
          Delegados acreditados:{" "}
          <span className="font-data">{acreditados}/16</span>
        </p>
      </div>

      <PiePagina texto="Página 1 de 2" />
    </>
  );
}

// ─── TRANSMISIÓN · PÁGINA 2 ─────────────────────────────────────────────────

function RecuadroFirma({
  rol,
  nombre,
  firma,
  vacio,
}: {
  rol: string;
  nombre: string;
  firma: string;
  vacio: boolean;
}) {
  return (
    <div className="rounded-[2px] border p-3" style={{ borderColor: LINEA }}>
      <div className="relative h-[64px]">
        {vacio ? (
          <span
            className="absolute inset-x-0 bottom-1 border-b border-dashed pb-1 text-center text-[10px] italic"
            style={{ borderColor: LINEA, color: "#8a8a80" }}
          >
            — sin firma —
          </span>
        ) : (
          <svg
            viewBox="0 0 130 56"
            className="h-full w-full"
            role="img"
            aria-label={`Firma de ${rol}`}
          >
            <path
              d={firma}
              fill="none"
              stroke={TINTA}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>
      <div className="border-t pt-1.5" style={{ borderColor: LINEA }}>
        <p className="text-[11px] font-semibold" style={{ color: TINTA }}>
          {nombre}
        </p>
        <p
          className="text-[9px] uppercase tracking-[0.1em]"
          style={{ color: "#6b6b63" }}
        >
          {rol}
        </p>
      </div>
    </div>
  );
}

function PaginaTransmision2({
  acta,
  puesto,
}: {
  acta: ActaMesa;
  puesto: Puesto;
}) {
  const advertencia =
    acta.formularios.TRANSMISION.find((p) => p.numero === 2)?.estado ===
    "ADVERTENCIA";
  const nombres = nombresDeMesa(acta);
  // Con advertencia: los recuadros de los TESTIGOS 3 y 4 quedan vacíos
  // (kit §2.3: «2 recuadros VACÍOS») + sello diagonal rojo.
  const vacios = advertencia ? [2, 3] : [];
  return (
    <>
      <div
        className="border-b-2 px-8 pb-5 pt-10 text-center"
        style={{ borderColor: TINTA }}
      >
        <p
          className="text-[19px] font-bold uppercase tracking-[0.04em]"
          style={{ color: TINTA }}
        >
          Hoja de Firmas y Validación
        </p>
        <p
          className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "#6b6b63" }}
        >
          {puesto.pais.toUpperCase()} — {puesto.puesto.toUpperCase()} · Mesa{" "}
          {acta.mesaId} · {acta.id}
        </p>
      </div>

      <div className="relative mx-8 mt-6">
        <div className="grid grid-cols-3 gap-3">
          {ROLES_FIRMA.map((rol, i) => (
            <RecuadroFirma
              key={rol}
              rol={rol}
              nombre={nombres[i]}
              firma={trazoFirma(acta, i)}
              vacio={vacios.includes(i)}
            />
          ))}
        </div>

        {advertencia && (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
            aria-hidden
          >
            <div
              className="px-7 py-3.5 text-center opacity-85"
              style={{
                color: SELLO,
                border: `6px double ${SELLO}`,
                transform: "rotate(-12deg)",
              }}
            >
              <p className="text-[15px] font-bold uppercase tracking-[0.12em]">
                Firma Ilegible — Rescaneo Solicitado
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Cuadro de observaciones (3 líneas determinísticas) */}
      <div className="mx-8 mt-8">
        <p
          className="text-[12px] font-bold uppercase tracking-[0.1em]"
          style={{ color: TINTA }}
        >
          Observaciones
        </p>
        <div
          className="mt-2 rounded-[2px] border p-3"
          style={{ borderColor: LINEA }}
        >
          {textoObservaciones(acta).map((linea) => (
            <p
              key={linea}
              className="border-b border-dashed py-2 text-[11px] last:border-b-0"
              style={{ borderColor: LINEA, color: "#3a3a34" }}
            >
              {linea}
            </p>
          ))}
        </div>
      </div>

      <PiePagina texto="Página 2 de 2" />
    </>
  );
}

// ─── DELEGADOS · PÁGINA ÚNICA ───────────────────────────────────────────────

function PaginaDelegados({
  mesa,
  acta,
  puesto,
}: {
  mesa: Mesa;
  acta: ActaMesa;
  puesto: Puesto;
}) {
  const acreditados = delegadosAcreditados(mesa);
  const nombres = nombresDeMesa(acta);
  return (
    <>
      <div
        className="border-b-2 px-8 pb-5 pt-10 text-center"
        style={{ borderColor: TINTA }}
      >
        <p
          className="text-[19px] font-bold uppercase tracking-[0.04em]"
          style={{ color: TINTA }}
        >
          Acta de Acreditación de Delegados
        </p>
        <p
          className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "#6b6b63" }}
        >
          {puesto.pais.toUpperCase()} — {puesto.puesto.toUpperCase()} · Mesa{" "}
          {acta.mesaId} · {acreditados}/16 acreditados
        </p>
      </div>

      <div className="mx-8 mt-6">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["Credencial", "Nombre del delegado", "Estado"].map(
                (encabezado, i) => (
                  <th
                    key={encabezado}
                    className={`border-y px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] ${
                      i === 2 ? "text-right" : "text-left"
                    }`}
                    style={{ borderColor: LINEA, color: "#6b6b63" }}
                  >
                    {encabezado}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {nombres.map((nombre, i) => (
              <tr key={`${acta.id}-${i + 1}`}>
                <td
                  className="font-data border-b px-3 py-[7px] text-[11px]"
                  style={{ borderColor: LINEA, color: TINTA }}
                >
                  {acta.id}-{i + 1}
                </td>
                <td
                  className="border-b px-3 py-[7px] text-[12px] font-medium"
                  style={{ borderColor: LINEA, color: TINTA }}
                >
                  {nombre}
                </td>
                <td
                  className="border-b px-3 py-[7px] text-right text-[10px] font-bold uppercase tracking-[0.08em]"
                  style={{
                    borderColor: LINEA,
                    color: i < acreditados ? "#1d6b2f" : "#8a8a80",
                  }}
                >
                  {i < acreditados ? "Acreditado" : "Ausente"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PiePagina texto="Folio Único" />
    </>
  );
}

// ─── Componente raíz ────────────────────────────────────────────────────────

function DocumentoE14Impl({
  tipo,
  pagina,
  mesa,
  acta,
  puesto,
}: {
  tipo: FormularioTipo;
  pagina: number;
  mesa: Mesa;
  acta: ActaMesa;
  puesto: Puesto;
}) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[2px] font-sans"
      style={{ width: ANCHO, height: ALTO, backgroundColor: PAPEL }}
      aria-label="Documento E-14 digitalizado"
      role="img"
    >
      {tipo === "TRANSMISION" ? (
        pagina === 1 ? (
          <PaginaTransmision1 mesa={mesa} acta={acta} puesto={puesto} />
        ) : (
          <PaginaTransmision2 acta={acta} puesto={puesto} />
        )
      ) : (
        <PaginaDelegados mesa={mesa} acta={acta} puesto={puesto} />
      )}
    </div>
  );
}

export const DocumentoE14 = memo(DocumentoE14Impl);
