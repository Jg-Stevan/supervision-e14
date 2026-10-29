"use client";

/**
 * VISTA CARGA MASIVA (kit carga-masiva-supervision-v2 / D27-REACTIVADA) —
 * el PRODUCTOR que faltaba en este repo: suelta/selecciona fotos, define
 * el DESTINO de cada página (idEnlace D22 · mesa · formulario · página) y
 * PROCESA la cola → cada página se publica por el SEAM real del módulo
 * (`actas-runtime.publicarActaMasiva`), el MISMO que consume el puente
 * remoto. El embudo queda completo EN VIVO: recepción (D28) cuenta la
 * llegada, el monitor aterriza el acta y los KPIs reflejan el estado.
 *
 * POR QUÉ NATIVA (no el módulo digitalizador completo): el pipeline OCR/QR
 * del digitalizador (72 archivos · rapidocr · workers · IndexedDB) vive en
 * el repo completo del proyecto — aquí la UBICACIÓN es manual (regla §0-1:
 * la foto se UBICA, no se INTERPRETA; sin OCR ni cifras de votación).
 * Cambiar el destino de una fila es un clic; la validación D25 (a/b/d) es
 * la MISMA del runtime — la fila inválida cae a CUARENTENA con su motivo.
 *
 * Datos: memoria de sesión (§0-5 / D8) — sin persistencia ni backend;
 * recargar restablece la cola (misma disciplina del resto del dashboard).
 */

import { useMemo, useRef, useState } from "react";
import {
  FileText,
  LoaderCircle,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  publicarActaMasiva,
  type EntradaActaMasiva,
  type ResultadoPublicacion,
} from "../data/actas-runtime";
import { CARGAR_CATALOGO, ID_ENLACE_ROMA } from "../data/divipola-adapter";
import type { FormularioTipo, ImpresionActa } from "../domain/acta";
import { KpiCard, type TonoKpi } from "./kpi-card";

// ─── Constantes del kit ──────────────────────────────────────────────────────

/** Páginas por formulario (actas-reales: TRANSMISIÓN-1/2 · DELEGADOS-1/2). */
const PAGINAS_POR_FORMULARIO = 2;

/** Lado mayor máx. de la foto procesada (mismo espíritu del pipeline masiva:
 * dataURL liviano en memoria de sesión — §0-5). */
const MAX_LADO_FOTO = 1400;

const CLASE_LABEL =
  "mb-1 block font-mono text-[10px] font-bold uppercase tracking-wide text-gray-400";

const CLASE_INPUT =
  "h-11 rounded-[4px] border-border bg-(--surface-lowest) font-data text-[13px]";

// ─── Tipos de la cola ────────────────────────────────────────────────────────

type EstadoFila = "EN_COLA" | "PUBLICADA" | "BLOQUEADA";

interface FilaCola {
  /** Identificador local de la fila (no viaja al runtime). */
  id: string;
  /** Payload EXACTO del seam (publicarActaMasiva — un solo contrato). */
  entrada: EntradaActaMasiva;
  estado: EstadoFila;
  /** Motivo de cuarentena (validación D25 a/b/d) — solo BLOQUEADA. */
  motivo?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** "1" → "001" (convención del catálogo — 3 dígitos). */
function formatearMesa(numeroMesa: number): string {
  return String(numeroMesa).padStart(3, "0");
}

/** Código de zona del catálogo ("010") → verbatim impreso ("10"). */
function zonaImpresa(codigoZona: string): string {
  return String(parseInt(codigoZona, 10)).padStart(2, "0");
}

/** Encabezado IMPRESO verbatim desde el catálogo (se muestra, no se
 * interpreta — §0-1). Sin barcode: el origen manual no lo captura. */
function impresionDeDestino(
  registro: {
    codigoMunicipio: string;
    nombreMunicipio: string;
    codigoZona: string;
    codigoPuesto: string;
    nombre: string;
  },
  mesa: string
): ImpresionActa {
  return {
    consulado: "88",
    pais: `${registro.codigoMunicipio} - ${registro.nombreMunicipio}`,
    zona: zonaImpresa(registro.codigoZona),
    puesto: registro.codigoPuesto,
    mesa,
    lugar: registro.nombre,
  };
}

/** Foto → dataURL reducido (canvas puro — misma disciplina del kit
 * editor-masiva: sin libs nuevas). Rechaza archivos no-imagen. */
function reducirFoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer el archivo"));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () =>
        reject(new Error("El archivo no se reconoce como imagen"));
      img.onload = () => {
        const escala = Math.min(
          1,
          MAX_LADO_FOTO / Math.max(img.naturalWidth, img.naturalHeight)
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas no disponible en este navegador"));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(lector.result);
    };
    lector.readAsDataURL(file);
  });
}

// ─── Píldora de estado de fila (paleta del repo — sin sombras) ──────────────

const PILDORA_ESTADO: Record<EstadoFila, string> = {
  EN_COLA: "border-border text-muted-foreground",
  PUBLICADA: "border-(--success) text-(--success)",
  BLOQUEADA: "border-(--warning) text-(--warning)",
};

const ETIQUETA_ESTADO: Record<EstadoFila, string> = {
  EN_COLA: "En cola",
  PUBLICADA: "Publicada",
  BLOQUEADA: "Cuarentena",
};

// ─── Fila de la cola ─────────────────────────────────────────────────────────

function FilaColaItem({
  fila,
  ocupada,
  onQuitar,
  onVerEnMonitor,
}: {
  fila: FilaCola;
  /** La corrida está en curso — la fila no se puede quitar. */
  ocupada: boolean;
  onQuitar: (id: string) => void;
  onVerEnMonitor: (
    idEnlace: string,
    mesa: string,
    tipo?: FormularioTipo
  ) => void;
}) {
  const { entrada } = fila;
  return (
    <li className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        {/* Miniatura (sin foto → hueco honesto — jamás inventar binarios) */}
        {entrada.srcFoto ? (
          <img
            src={entrada.srcFoto}
            alt={`Foto de la página ${entrada.paginaIndex}`}
            className="h-13 w-10 shrink-0 rounded-[4px] border border-border object-cover"
            loading="lazy"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-13 w-10 shrink-0 items-center justify-center rounded-[4px] border border-border bg-(--surface-lowest) text-muted-foreground"
          >
            <FileText className="size-4" />
          </span>
        )}

        {/* Estado + destino */}
        <span className="min-w-0 flex-1">
          <span className="font-data block truncate text-[12px] leading-5 font-semibold">
            {entrada.idEnlace} · MESA {entrada.mesa}
          </span>
          <span className="body-md block truncate text-muted-foreground">
            {entrada.impresion.pais} — {entrada.impresion.lugar}
          </span>
          {fila.motivo && (
            <span className="body-md mt-0.5 block text-(--warning)">
              CUARENTENA (D25) — {fila.motivo}
            </span>
          )}
        </span>

        {/* Formulario · página · nombre de archivo */}
        <span className="w-44 shrink-0">
          <span className="body-md block">
            {entrada.formulario === "TRANSMISION" ? "TRANSMISIÓN" : "CÓNSUL/EMBAJADOR"}
          </span>
          <span className="font-data block text-[11px] text-muted-foreground">
            PÁG {entrada.paginaIndex}/{entrada.paginaTotal} · SCORE{" "}
            {entrada.score.toFixed(1)}
          </span>
          <span className="font-data block truncate text-[11px] text-muted-foreground">
            {entrada.nombreArchivo}
          </span>
        </span>

        {/* Desenlace + acciones */}
        <span className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "label-caps inline-block rounded-[4px] border px-1.5 py-0.5",
              PILDORA_ESTADO[fila.estado]
            )}
          >
            {ETIQUETA_ESTADO[fila.estado]}
          </span>
          {fila.estado === "PUBLICADA" && (
            <Button
              variant="ghost"
              size="sm"
              className="label-caps h-11 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
              aria-label={`Ver en monitor: ${entrada.idEnlace} mesa ${entrada.mesa}`}
              onClick={() =>
                onVerEnMonitor(entrada.idEnlace, entrada.mesa, entrada.formulario)
              }
            >
              <FileText className="size-4" aria-hidden />
              Ver en monitor
            </Button>
          )}
          {fila.estado !== "PUBLICADA" && !ocupada && (
            <Button
              variant="ghost"
              size="sm"
              className="h-11 px-2 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
              aria-label={`Quitar de la cola: ${entrada.nombreArchivo}`}
              onClick={() => onQuitar(fila.id)}
            >
              <X className="size-4" aria-hidden />
            </Button>
          )}
        </span>
      </div>
    </li>
  );
}

// ─── Vista ───────────────────────────────────────────────────────────────────

export function VistaCargaMasiva({
  onVerEnMonitor,
}: {
  onVerEnMonitor?: (
    puestoId: string,
    mesaId: string,
    tipo?: FormularioTipo
  ) => void;
}) {
  // Catálogo memoizado (una sola prep — D12). Si la validación estricta
  // aborta, la vista sigue con el aviso honesto (sin bloquear el shell).
  const catalogo = useMemo(() => {
    try {
      return CARGAR_CATALOGO();
    } catch {
      return [];
    }
  }, []);
  const catalogoPorId = useMemo(
    () => new Map(catalogo.map((r) => [r.idEnlace, r])),
    [catalogo]
  );

  // ── Formulario de destino ────────────────────────────────────────────────
  const [enlace, setEnlace] = useState(ID_ENLACE_ROMA);
  const [mesaTexto, setMesaTexto] = useState("1");
  const [formulario, setFormulario] = useState<FormularioTipo>("TRANSMISION");
  const [pagina, setPagina] = useState(1);
  const [foto, setFoto] = useState<string | null>(null);
  const [nombreFoto, setNombreFoto] = useState<string | null>(null);
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null);

  // ── Cola + corrida ───────────────────────────────────────────────────────
  const [cola, setCola] = useState<FilaCola[]>([]);
  const [procesando, setProcesando] = useState(false);
  const secuencia = useRef(0);

  const registroSel = enlace ? catalogoPorId.get(enlace) : undefined;
  const mesasTexto = registroSel ? String(registroSel.totalMesas) : "—";

  const contadores = useMemo(() => {
    const enCola = cola.filter((f) => f.estado === "EN_COLA").length;
    const publicadas = cola.filter((f) => f.estado === "PUBLICADA").length;
    const bloqueadas = cola.filter((f) => f.estado === "BLOQUEADA").length;
    return { enCola, publicadas, bloqueadas };
  }, [cola]);

  const KPIS: { titulo: string; valor: number; tono: TonoKpi }[] = [
    { titulo: "En cola", valor: contadores.enCola, tono: "neutral" },
    { titulo: "Publicadas", valor: contadores.publicadas, tono: "success" },
    { titulo: "Cuarentena", valor: contadores.bloqueadas, tono: "warning" },
  ];

  /** Validación temprana D25 (a/b) — la definitiva la hace el runtime. */
  function validarDestino(): {
    entrada: Omit<EntradaActaMasiva, "nombreArchivo">;
  } | { error: string } {
    const registro = catalogoPorId.get(enlace.trim());
    if (!registro) {
      return { error: `(a) idEnlace "${enlace.trim()}" ausente en el catálogo DIVIPOLA` };
    }
    const numeroMesa = Number(mesaTexto);
    if (
      !Number.isInteger(numeroMesa) ||
      numeroMesa < 1 ||
      numeroMesa > registro.totalMesas
    ) {
      return {
        error: `(b) mesa ${mesaTexto || "vacía"} fuera de rango (totalMesas: ${registro.totalMesas})`,
      };
    }
    if (!Number.isInteger(pagina) || pagina < 1 || pagina > PAGINAS_POR_FORMULARIO) {
      return { error: `(d) página ${pagina} fuera de rango (total: ${PAGINAS_POR_FORMULARIO})` };
    }
    const mesa = formatearMesa(numeroMesa);
    return {
      entrada: {
        idEnlace: registro.idEnlace,
        mesa,
        formulario,
        paginaIndex: pagina,
        paginaTotal: PAGINAS_POR_FORMULARIO,
        srcFoto: foto,
        impresion: impresionDeDestino(registro, mesa),
        score: 1,
        statusActa: "OPTIMA",
      },
    };
  }

  function empujarFila(entrada: EntradaActaMasiva) {
    secuencia.current += 1;
    const id = `fila-${secuencia.current}`;
    setCola((prev) => [...prev, { id, entrada, estado: "EN_COLA" }]);
  }

  /** AÑADIR: una fila con el destino del formulario (y la foto si hay). */
  function anadir() {
    const destino = validarDestino();
    if ("error" in destino) {
      setErrorFormulario(destino.error);
      return;
    }
    setErrorFormulario(null);
    empujarFila({
      ...destino.entrada,
      nombreArchivo: nombreFoto ?? `manual-${enlace}-m${destino.entrada.mesa}-p${pagina}.jpg`,
    });
    // La foto se consume (una foto = una fila — pipeline masiva); el
    // destino queda para agilizar la siguiente página del mismo paquete.
    setFoto(null);
    setNombreFoto(null);
    setPagina((p) => (p < PAGINAS_POR_FORMULARIO ? p + 1 : PAGINAS_POR_FORMULARIO));
  }

  /** SOLTAR FOTOS (multiple): cada archivo = una fila; las páginas se
   * auto-asignan en secuencia desde la página del formulario. */
  async function soltarFotos(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    const destino = validarDestino();
    if ("error" in destino) {
      setErrorFormulario(destino.error);
      return;
    }
    setErrorFormulario(null);
    let paginaLibre = pagina;
    for (const archivo of Array.from(archivos)) {
      try {
        const dataUrl = await reducirFoto(archivo);
        const registro = catalogoPorId.get(enlace.trim());
        if (!registro) return;
        const mesaSegura = destino.entrada.mesa;
        empujarFila({
          ...destino.entrada,
          paginaIndex: paginaLibre,
          srcFoto: dataUrl,
          nombreArchivo: archivo.name,
          impresion: impresionDeDestino(registro, mesaSegura),
        });
        paginaLibre =
          paginaLibre < PAGINAS_POR_FORMULARIO ? paginaLibre + 1 : paginaLibre;
      } catch (motivo) {
        setErrorFormulario(
          motivo instanceof Error ? motivo.message : "Archivo ilegible"
        );
        return;
      }
    }
    setFoto(null);
    setNombreFoto(null);
  }

  /** ACTAS DEMO: 2 páginas TRANSMISIÓN · mesa 001 del ANCLA Roma (§2.3),
   * sin foto → caen al sintético D18. Prueba el embudo completo sin
   * archivos: recepción, join por clave y aterrizaje en el monitor. */
  function anadirDemo() {
    const registro = catalogoPorId.get(ID_ENLACE_ROMA);
    if (!registro) {
      setErrorFormulario("El ancla demo Roma no está en el catálogo");
      return;
    }
    setErrorFormulario(null);
    const mesa = formatearMesa(1);
    for (let p = 1; p <= PAGINAS_POR_FORMULARIO; p += 1) {
      empujarFila({
        idEnlace: registro.idEnlace,
        mesa,
        formulario: "TRANSMISION",
        paginaIndex: p,
        paginaTotal: PAGINAS_POR_FORMULARIO,
        srcFoto: null,
        impresion: impresionDeDestino(registro, mesa),
        score: 1,
        statusActa: "OPTIMA",
        nombreArchivo: `demo-roma-m${mesa}-p${p}.jpg`,
      });
    }
  }

  /** PROCESAR COLA: secuencial (mismo orden de subida) por el seam real.
   * Cada desenlace queda en la fila Y en el log de recepción (D28). */
  async function procesar() {
    const pendientes = cola.filter((f) => f.estado === "EN_COLA");
    if (pendientes.length === 0 || procesando) return;
    setProcesando(true);
    try {
      for (const pendiente of pendientes) {
        const resultado: ResultadoPublicacion = await publicarActaMasiva(
          pendiente.entrada
        );
        setCola((prev) =>
          prev.map((f) =>
            f.id === pendiente.id
              ? resultado.ok
                ? { ...f, estado: "PUBLICADA" as const, motivo: undefined }
                : { ...f, estado: "BLOQUEADA" as const, motivo: resultado.motivo }
              : f
          )
        );
      }
    } finally {
      setProcesando(false);
    }
  }

  function quitar(id: string) {
    if (procesando) return;
    setCola((prev) => prev.filter((f) => f.id !== id));
  }

  function limpiarResueltas() {
    if (procesando) return;
    setCola((prev) => prev.filter((f) => f.estado === "EN_COLA"));
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      {/* Encabezado */}
      <header>
        <h1 className="headline-lg">Carga masiva</h1>
        <p className="body-md mt-1 max-w-3xl text-muted-foreground">
          Cola de páginas de actas del digitalizador: define el destino de
          cada foto (enlace · mesa · formulario · página) y procésala — cada
          publicación aterriza EN VIVO en Recepción y en el monitor. La
          validación es la misma del runtime (D25): idEnlace en catálogo,
          mesa y página en rango.
        </p>
      </header>

      {/* KPIs de la corrida */}
      <section aria-label="Resumen de la corrida" className="grid grid-cols-3 gap-3">
        {KPIS.map((kpi) => (
          <KpiCard key={kpi.titulo} {...kpi} />
        ))}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* ── Formulario de destino ─────────────────────────────────────── */}
        <section
          aria-label="Destino del envío"
          className="rounded-[4px] border border-border bg-card p-4"
        >
          <h2 className="label-caps mb-4 text-muted-foreground">
            Destino del envío
          </h2>

          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="cm-enlace" className={CLASE_LABEL}>
                Enlace (idEnlace DIVIPOLA)
              </label>
              <Input
                id="cm-enlace"
                list="cm-catalogo"
                value={enlace}
                onChange={(e) => {
                  setEnlace(e.target.value);
                  setErrorFormulario(null);
                }}
                placeholder="88_495_010_02"
                className={CLASE_INPUT}
                autoComplete="off"
              />
              <datalist id="cm-catalogo">
                {catalogo.map((r) => (
                  <option key={r.idEnlace} value={r.idEnlace}>
                    {r.nombre}
                  </option>
                ))}
              </datalist>
              <p className="body-md mt-1 text-muted-foreground">
                {registroSel
                  ? `${registroSel.nombre} · ${registroSel.totalMesas} mesas`
                  : `${catalogo.length} puestos en el catálogo (escribe para filtrar)`}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cm-mesa" className={CLASE_LABEL}>
                  Mesa (1–{mesasTexto})
                </label>
                <Input
                  id="cm-mesa"
                  type="number"
                  min={1}
                  max={registroSel?.totalMesas ?? undefined}
                  value={mesaTexto}
                  onChange={(e) => {
                    setMesaTexto(e.target.value);
                    setErrorFormulario(null);
                  }}
                  className={CLASE_INPUT}
                />
              </div>
              <div>
                <label htmlFor="cm-pagina" className={CLASE_LABEL}>
                  Página (1–{PAGINAS_POR_FORMULARIO})
                </label>
                <Input
                  id="cm-pagina"
                  type="number"
                  min={1}
                  max={PAGINAS_POR_FORMULARIO}
                  value={pagina}
                  onChange={(e) => {
                    setPagina(Number(e.target.value) || 1);
                    setErrorFormulario(null);
                  }}
                  className={CLASE_INPUT}
                />
              </div>
            </div>

            <div>
              <span className={CLASE_LABEL}>Formulario</span>
              <div
                role="group"
                aria-label="Tipo de formulario"
                className="flex gap-2"
              >
                {(["TRANSMISION", "DELEGADOS"] as const).map((tipo) => (
                  <Button
                    key={tipo}
                    type="button"
                    variant="outline"
                    className={cn(
                      "label-caps h-11 flex-1 shadow-none",
                      formulario === tipo &&
                        "border-(--primary) text-(--primary)"
                    )}
                    aria-pressed={formulario === tipo}
                    onClick={() => setFormulario(tipo)}
                  >
                    {tipo === "TRANSMISION" ? "Transmisión" : "Cónsul/Embajador"}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <span className={CLASE_LABEL}>Foto de la página (opcional)</span>
              {foto ? (
                <div className="flex items-center gap-3">
                  <img
                    src={foto}
                    alt="Vista previa de la foto adjunta"
                    className="h-16 w-12 rounded-[4px] border border-border object-cover"
                  />
                  <span className="font-data min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                    {nombreFoto ?? "foto adjunta"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 px-2 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
                    aria-label="Quitar foto"
                    onClick={() => {
                      setFoto(null);
                      setNombreFoto(null);
                    }}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
              ) : (
                <label
                  htmlFor="cm-foto"
                  className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[4px] border border-dashed border-border text-muted-foreground hover:bg-(--accent) hover:text-foreground"
                >
                  <Upload className="size-4" aria-hidden />
                  <span className="label-caps">Soltar foto — cae al sintético si no hay</span>
                </label>
              )}
              <input
                id="cm-foto"
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const archivos = e.target.files;
                  if (archivos && archivos.length === 1) {
                    // Un solo archivo → vista previa editable en el formulario
                    void reducirFoto(archivos[0]).then((dataUrl) => {
                      setFoto(dataUrl);
                      setNombreFoto(archivos[0].name);
                    });
                  } else {
                    // Varios → filas directas a la cola (páginas en secuencia)
                    void soltarFotos(archivos);
                  }
                  e.target.value = "";
                }}
              />
            </div>

            {errorFormulario && (
              <p
                role="alert"
                className="body-md rounded-[4px] border border-(--warning) px-3 py-2 text-(--warning)"
              >
                {errorFormulario}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="label-caps h-11 flex-1 shadow-none"
                onClick={anadir}
              >
                <Plus className="size-4" aria-hidden />
                Añadir a la cola
              </Button>
              <Button
                type="button"
                variant="outline"
                className="label-caps h-11 shadow-none"
                onClick={anadirDemo}
                title="Dos páginas TRANSMISIÓN · mesa 001 de Roma (sintético D18)"
              >
                <Sparkles className="size-4" aria-hidden />
                Actas demo
              </Button>
            </div>
          </div>
        </section>

        {/* ── Cola de carga ─────────────────────────────────────────────── */}
        <section
          aria-label="Cola de carga"
          className="rounded-[4px] border border-border bg-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
            <h2 className="label-caps text-muted-foreground">
              Cola ({cola.length})
            </h2>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="label-caps h-11 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
                disabled={procesando || contadores.publicadas + contadores.bloqueadas === 0}
                onClick={limpiarResueltas}
              >
                <Trash2 className="size-4" aria-hidden />
                Limpiar resueltas
              </Button>
              <Button
                type="button"
                size="sm"
                className="label-caps h-11 shadow-none"
                disabled={procesando || contadores.enCola === 0}
                onClick={() => void procesar()}
              >
                {procesando ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Play className="size-4" aria-hidden />
                )}
                {procesando ? "Procesando…" : "Procesar cola"}
              </Button>
            </div>
          </div>

          {cola.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
              <Upload className="size-6 text-muted-foreground" aria-hidden />
              <p className="body-md text-muted-foreground">
                La cola está vacía — añade páginas con el formulario, suelta
                varias fotos a la vez o prueba el botón de actas demo.
              </p>
            </div>
          ) : (
            <ul className="scroll-panel max-h-96 overflow-y-auto">
              {cola.map((fila) => (
                <FilaColaItem
                  key={fila.id}
                  fila={fila}
                  ocupada={procesando}
                  onQuitar={quitar}
                  onVerEnMonitor={(idEnlace, mesa, tipo) =>
                    onVerEnMonitor?.(idEnlace, mesa, tipo)
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
