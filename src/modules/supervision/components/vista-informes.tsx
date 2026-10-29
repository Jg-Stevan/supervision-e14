"use client";

import { useMemo, useState } from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDatos } from "./datos-provider";
import { StatusBadge } from "./status-badge";
import type { Mesa, Puesto } from "../domain/types";

/**
 * Vista Generar Informes (kit SUP-3 T7 / D15): formulario de alcance +
 * preview en pantalla + DESCARGA REAL client-side (.md y .csv con Blob +
 * URL.createObjectURL + <a download>) — sin backend (§0-5). La fecha del
 * informe es la real del navegador (es un informe, no un dato del mock).
 */

const VALOR_GLOBAL = "global";

function fechaLarga(): string {
  return new Date().toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fechaISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function descargar(contenido: string, nombre: string, tipo: string): void {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface InformeGlobal {
  tipo: "global";
  puestos: Puesto[];
  resumen: { total: number; completo: number; critico: number; pendiente: number; noIniciado: number };
}
interface InformePuesto {
  tipo: "puesto";
  puesto: Puesto;
  mesas: Mesa[];
}
type Informe = InformeGlobal | InformePuesto;

function kpisDe(puestos: Puesto[]) {
  const r = { total: puestos.length, completo: 0, critico: 0, pendiente: 0, noIniciado: 0 };
  for (const p of puestos) {
    if (p.estadoGlobal === "COMPLETO") r.completo += 1;
    if (p.estadoGlobal === "CRITICO") r.critico += 1;
    if (p.estadoGlobal === "PENDIENTE") r.pendiente += 1;
    if (p.estadoGlobal === "NO_INICIADO") r.noIniciado += 1;
  }
  return r;
}

/** Markdown del informe (descarga .md, kit T7). */
function aMarkdown(informe: Informe): string {
  const lineas: string[] = [];
  lineas.push(`# Informe de supervisión E-14`);
  lineas.push("");
  lineas.push(`- **Fecha del informe:** ${fechaLarga()}`);
  lineas.push(
    informe.tipo === "global"
      ? `- **Alcance:** Global (${informe.resumen.total} puestos)`
      : `- **Alcance:** ${informe.puesto.codigoPais} - ${informe.puesto.pais} (${informe.puesto.puesto})`
  );
  lineas.push("");
  lineas.push(`## Resumen de estado`);
  lineas.push("");
  if (informe.tipo === "global") {
    const r = informe.resumen;
    lineas.push(
      `| Total | COMPLETO | CRÍTICO | PENDIENTE | NO INICIADO |`,
      `|---|---|---|---|---|`,
      `| ${r.total} | ${r.completo} | ${r.critico} | ${r.pendiente} | ${r.noIniciado} |`
    );
    lineas.push("");
    lineas.push(`## Puestos`);
    lineas.push("");
    lineas.push(
      `| País | Puesto | Mesas | E-14 deleg. | E-14 transm. | Estado global |`,
      `|---|---|---|---|---|---|`
    );
    for (const p of informe.puestos) {
      lineas.push(
        `| ${p.codigoPais} - ${p.pais} | ${p.puesto} | ${p.numeroMesas} | ${p.pctDelegado}% | ${p.pctTransmision}% | ${p.estadoGlobal} |`
      );
    }
  } else {
    const p = informe.puesto;
    const k = kpisDe([p]);
    lineas.push(
      `| COMPLETO | CRÍTICO | PENDIENTE | NO INICIADO |`,
      `|---|---|---|---|`,
      `| ${k.completo} | ${k.critico} | ${k.pendiente} | ${k.noIniciado} |`
    );
    lineas.push("");
    lineas.push(`## Mesas del puesto`);
    lineas.push("");
    lineas.push(
      `| Mesa | Delegados | Transmisión | Estado mesa | Última carga |`,
      `|---|---|---|---|---|`
    );
    for (const m of informe.mesas) {
      const deleg = [m.delegados.p1, m.delegados.p2].map((e) => (e === "ok" ? "OK" : "Pend")).join("/");
      const trans = [m.transmision.p1.estado, m.transmision.p2.estado]
        .map((e) => (e === "ok" ? "OK" : "Pend"))
        .join("/");
      lineas.push(
        `| ${m.id} | ${deleg} | ${trans} | ${m.estadoMesa} | ${m.ultimaCarga ?? "—"} |`
      );
    }
  }
  lineas.push("");
  return lineas.join("\n");
}

/** CSV de la tabla compacta del preview (descarga .csv, kit T7). */
function aCsv(informe: Informe): string {
  const filas: string[] = [];
  const esc = (v: string | number) => {
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  if (informe.tipo === "global") {
    filas.push("Pais,Codigo,Puesto,Mesas,Delegado %,Transmision %,Estado global");
    for (const p of informe.puestos) {
      filas.push(
        [esc(p.pais), p.codigoPais, esc(p.puesto), p.numeroMesas, p.pctDelegado, p.pctTransmision, p.estadoGlobal].join(",")
      );
    }
  } else {
    filas.push("Mesa,Delegados,Transmision,Estado mesa,Ultima carga,Alertas");
    for (const m of informe.mesas) {
      const deleg = [m.delegados.p1, m.delegados.p2].map((e) => (e === "ok" ? "OK" : "Pend")).join("/");
      const trans = [m.transmision.p1.estado, m.transmision.p2.estado]
        .map((e) => (e === "ok" ? "OK" : "Pend"))
        .join("/");
      const alertas = [m.transmision.p1.alerta, m.transmision.p2.alerta]
        .filter(Boolean)
        .join(" ");
      filas.push(
        [m.id, deleg, trans, m.estadoMesa, esc(m.ultimaCarga ?? "—"), esc(alertas || "")].join(",")
      );
    }
  }
  return filas.join("\n") + "\n";
}

export function VistaInformes() {
  const { cargando, puestos, mesasPorPuesto, resumen } = useDatos();
  const [alcance, setAlcance] = useState<string>(VALOR_GLOBAL);
  const [informe, setInforme] = useState<Informe | null>(null);

  const puestoSeleccionado = useMemo(
    () => (alcance === VALOR_GLOBAL ? null : puestos.find((p) => p.id === alcance) ?? null),
    [alcance, puestos]
  );

  if (cargando) {
    return (
      <div className="space-y-3 p-4 md:p-6">
        <div className="h-11 w-full max-w-md animate-pulse rounded-[4px] bg-(--surface)" aria-hidden />
        <div className="h-96 w-full animate-pulse rounded-[4px] bg-(--surface)" aria-hidden />
      </div>
    );
  }

  const generar = () => {
    if (alcance === VALOR_GLOBAL) {
      setInforme({ tipo: "global", puestos, resumen });
    } else if (puestoSeleccionado) {
      setInforme({
        tipo: "puesto",
        puesto: puestoSeleccionado,
        mesas: mesasPorPuesto[puestoSeleccionado.id] ?? [],
      });
    }
  };

  const nombreBase = `informe-e14-${alcance === VALOR_GLOBAL ? "global" : (puestoSeleccionado?.codigoPais ?? "puesto")}-${fechaISO()}`;

  const descargarMd = () => {
    if (!informe) return;
    const nombre = `${nombreBase}.md`;
    descargar(aMarkdown(informe), nombre, "text/markdown;charset=utf-8");
    toast.success(`Descargado ${nombre}`);
  };

  const descargarCsv = () => {
    if (!informe) return;
    const nombre = `${nombreBase}.csv`;
    descargar(aCsv(informe), nombre, "text/csv;charset=utf-8");
    toast.success(`Descargado ${nombre}`);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header>
        <h2 className="headline-md">Generar informes</h2>
        <p className="body-md mt-1 text-muted-foreground">
          Informe del demo con los datos del mock — descarga client-side, sin
          backend.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-[4px] border border-border bg-card p-3">
        <div className="min-w-56 flex-1">
          <Select value={alcance} onValueChange={setAlcance}>
            <SelectTrigger
              aria-label="Alcance del informe"
              className="h-11 border-border bg-(--input) font-data text-[13px] shadow-none data-[placeholder]:text-muted-foreground"
            >
              <SelectValue placeholder="Alcance" />
            </SelectTrigger>
            <SelectContent className="border-border bg-popover">
              <SelectItem value={VALOR_GLOBAL} className="h-11">
                Global (todos los puestos)
              </SelectItem>
              {puestos.map((p) => (
                <SelectItem key={p.id} value={p.id} className="h-11">
                  {p.codigoPais} - {p.pais} ({p.puesto})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          className="label-caps h-11 bg-(--primary) px-4 text-[--primary-foreground] hover:bg-(--primary)/90"
          onClick={generar}
        >
          Generar informe
        </Button>
      </div>

      {informe ? (
        <section className="space-y-4" aria-label="Vista previa del informe">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-border bg-card px-4 py-3">
            <div>
              <p className="label-caps text-muted-foreground">
                Vista previa — informe del {fechaLarga()}
              </p>
              <p className="body-md mt-0.5">
                {informe.tipo === "global"
                  ? `Alcance: Global (${informe.resumen.total} puestos)`
                  : `Alcance: ${informe.puesto.codigoPais} - ${informe.puesto.pais} (${informe.puesto.puesto})`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="label-caps h-11 border shadow-none hover:bg-transparent"
                onClick={descargarMd}
              >
                <FileDown className="size-4" aria-hidden />
                Descargar .md
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="label-caps h-11 border shadow-none hover:bg-transparent"
                onClick={descargarCsv}
              >
                <FileSpreadsheet className="size-4" aria-hidden />
                Descargar .csv
              </Button>
            </div>
          </div>

          {informe.tipo === "global" ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                {[
                  ["Total", informe.resumen.total],
                  ["COMPLETO", informe.resumen.completo],
                  ["CRÍTICO", informe.resumen.critico],
                  ["PENDIENTE", informe.resumen.pendiente],
                  ["NO INICIADO", informe.resumen.noIniciado],
                ].map(([etiqueta, valor]) => (
                  <div key={String(etiqueta)} className="rounded-[4px] border border-border bg-card px-4 py-3">
                    <p className="label-caps text-muted-foreground">{etiqueta}</p>
                    <p className="stats-number font-data">{valor}</p>
                  </div>
                ))}
              </div>
              <div className="max-h-96 overflow-auto rounded-[4px] border border-border">
                <table className="w-full border-collapse bg-card text-sm">
                  <thead>
                    <tr>
                      {["País", "Puesto", "Mesas", "Deleg.", "Transm.", "Estado"].map((h) => (
                        <th key={h} className="label-caps sticky top-0 h-11 border-b border-border bg-card px-3 text-left text-muted-foreground whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {informe.puestos.map((p) => (
                      <tr key={p.id} className="border-b border-border last:border-b-0">
                        <td className="body-md px-3 py-2 whitespace-nowrap">
                          {p.codigoPais} - {p.pais}
                        </td>
                        <td className="body-md px-3 py-2 whitespace-nowrap">{p.puesto}</td>
                        <td className="body-md px-3 py-2">{p.numeroMesas}</td>
                        <td className="body-md font-data px-3 py-2">{p.pctDelegado}%</td>
                        <td className="body-md font-data px-3 py-2">{p.pctTransmision}%</td>
                        <td className="px-3 py-2">
                          <StatusBadge estado={p.estadoGlobal} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {(() => {
                  const k = kpisDe([informe.puesto]);
                  return [
                    ["COMPLETO", k.completo],
                    ["CRÍTICO", k.critico],
                    ["PENDIENTE", k.pendiente],
                    ["NO INICIADO", k.noIniciado],
                  ].map(([etiqueta, valor]) => (
                    <div key={String(etiqueta)} className="rounded-[4px] border border-border bg-card px-4 py-3">
                      <p className="label-caps text-muted-foreground">{etiqueta}</p>
                      <p className="stats-number font-data">{valor}</p>
                    </div>
                  ));
                })()}
              </div>
              <div className="overflow-auto rounded-[4px] border border-border">
                <table className="w-full min-w-[640px] border-collapse bg-card text-sm">
                  <thead>
                    <tr>
                      {["Mesa", "Delegados", "Transmisión", "Estado mesa", "Última carga"].map((h) => (
                        <th key={h} className="label-caps sticky top-0 h-11 border-b border-border bg-card px-3 text-left text-muted-foreground whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {informe.mesas.map((m) => (
                      <tr key={m.id} className="border-b border-border last:border-b-0">
                        <td className="body-md px-3 py-2">{m.id}</td>
                        <td className="body-md px-3 py-2">
                          {[m.delegados.p1, m.delegados.p2].map((e, i) => (
                            <span key={i} className={e === "ok" ? "text-(--success)" : "text-muted-foreground"}>
                              {e === "ok" ? "OK" : "Pend"}
                              {i === 0 ? " / " : ""}
                            </span>
                          ))}
                        </td>
                        <td className="body-md px-3 py-2">
                          {[m.transmision.p1, m.transmision.p2].map((parte, i) => (
                            <span key={i} className={parte.estado === "ok" ? "text-(--success)" : "text-muted-foreground"}>
                              {parte.estado === "ok" ? "OK" : "Pend"}
                              {i === 0 ? " / " : ""}
                            </span>
                          ))}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge estado={m.estadoMesa} />
                        </td>
                        <td className="body-md font-data px-3 py-2 text-muted-foreground">
                          {m.ultimaCarga ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ) : (
        <div className="rounded-[4px] border border-border bg-card px-4 py-8 text-center">
          <p className="body-md text-muted-foreground">
            Elige un alcance y genera el informe para ver la vista previa.
          </p>
        </div>
      )}
    </div>
  );
}
