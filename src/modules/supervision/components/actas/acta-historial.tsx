"use client";

import type { EventoActa, NivelEventoActa } from "../../domain/acta";
import { horaEnZonaDesdeLocal } from "../../domain/reloj-jornada";
import { useRelojVivo } from "../reloj-vivo";

/**
 * Timeline vertical del acta (KIT VISOR-MONITOR-GLOBAL-v1 §4-T7 — diseño
 * del mantenedor): línea border-l outline-variant, puntos de color SEMÁNTICOS
 * (verde = publicación/envío · ámbar = recibido en cola · gris = pendiente
 * /cierre · rojo = crítico · teal = aprobada), evento más reciente ARRIBA
 * (el orden del array — los eventos nuevos se insertan al frente).
 *
 * Mapeo del punto (T7.2 — la imagen del mantenedor: verde PUBLICADO, ámbar
 * RECIBIDO EN COLA, gris PENDIENTE): el nivel D19 solo distingue
 * CRITICO/ALERTA/NEUTRAL/APROBADA y la publicación viaja como NEUTRAL —
 * el color semanticamente correcto se resuelve por TÍTULO del evento
 * existente (T7.6: NO se inventan eventos, solo se reestiliza). Resto de
 * niveles → COLOR_POR_NIVEL.
 *
 * Fila 1: hora mono + sufijo de zona horaria (`14:38 LOCAL / 16:18 PAÍS` —
 * la segunda es la hora del país emisor, zona IANA del puesto, ronda
 * «reloj real»). Sin zona → solo LOCAL (T7.3).
 * Fila 2: título del evento bold uppercase (T7.4 — label-caps ya es
 * bold/uppercase). Fila 3: descripción gris (T7.5).
 */

const COLOR_POR_NIVEL: Record<NivelEventoActa, string> = {
  CRITICO: "var(--danger)",
  ALERTA: "var(--amber)", // T-03 — token único de ámbar del tema
  NEUTRAL: "var(--outline-strong)",
  APROBADA: "var(--primary)",
};

/** T7.2 — color del punto por SEMÁNTICA del evento existente (la imagen:
 *  verde=PUBLICADO, ámbar=RECIBIDO EN COLA, gris=PENDIENTE). Los títulos
 *  son los textos reales del historial sembrado/enlazado (D19). */
function colorDePunto(evento: EventoActa): string {
  if (evento.titulo.startsWith("TRANSMISIÓN")) return "var(--success)";
  if (evento.titulo === "RECIBIDO EN COLA") return "var(--amber)";
  return COLOR_POR_NIVEL[evento.nivel];
}

export function ActaHistorial({
  eventos,
  zonaEmisor,
  pais,
  sinTitulo,
}: {
  eventos: EventoActa[];
  /** Zona IANA del país emisor (puesto.zonaEmisor) — habilita la hora dual. */
  zonaEmisor?: string;
  /** Nombre del país (puesto.pais) para la etiqueta «PAÍS». */
  pais?: string;
  /** Oculta el título (el acordeón móvil ya lo muestra — plan M1). */
  sinTitulo?: boolean;
}) {
  // Hora dual (canónico de lint — reloj-vivo): snapshot del MINUTO en
  // curso vía useSyncExternalStore (Date.now() es impuro en render).
  // Snapshot 0 = servidor / sin reloj → solo LOCAL (sin proyección).
  const ahora = useRelojVivo();
  return (
    <div className="space-y-2">
      {sinTitulo ? (
        /* Móvil (plan M1) — el título lo pone el acordeón; aquí queda la
           línea del diseño: «Auditoría en tiempo real · SESIÓN ACTIVA». */
        <div className="flex items-center justify-between text-[10px] tracking-wider text-muted-foreground">
          <span>Auditoría en tiempo real</span>
          <span className="font-mono uppercase">Sesión activa</span>
        </div>
      ) : (
        /* Desktop (T7.1) — `HISTORIAL Y TRAZABILIDAD` en teal + tag derecha
           `SESIÓN ACTIVA`. */
        <div className="flex items-center justify-between">
          <p className="label-caps text-(--primary)">
            Historial y trazabilidad
          </p>
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            Sesión activa
          </span>
        </div>
      )}
      {eventos.length === 0 ? (
        <p className="body-md text-muted-foreground">Sin eventos registrados.</p>
      ) : (
        <ol className="ml-1.5 border-l border-(--outline-variant) pl-4">
          {eventos.map((evento, indice) => {
            const horaPais =
              zonaEmisor && pais && ahora > 0
                ? horaEnZonaDesdeLocal(evento.hora, zonaEmisor, ahora)
                : null;
            return (
              <li
                key={`${evento.hora}-${evento.titulo}-${indice}`}
                className="relative pb-4 last:pb-0"
              >
                {/* Punto sobre la línea (borde = fondo de la sidebar, D14). */}
                <span
                  className="absolute top-1 -left-[22px] size-2.5 rounded-full border-2 border-(--card)"
                  style={{ backgroundColor: colorDePunto(evento) }}
                  aria-hidden
                />
                {/* T7.3 — hora mono + sufijo de zona horaria. El dato viaja
                    verbatim del dominio (D19: «14:38 LOCAL») — el sufijo
                    LOCAL solo se añade si el evento no lo trae (eventos
                    futuros); PAÍS se añade a la hora proyectada del emisor. */}
                <p className="font-data text-[11px] text-(--outline-strong)">
                  {evento.hora}
                  {!/LOCAL\s*$/i.test(evento.hora) && " LOCAL"}
                  {horaPais && (
                    <span className="text-muted-foreground">
                      {" / "}
                      {horaPais} PAÍS
                      <span className="sr-only">
                        {" "}
                        — hora local del país emisor ({pais})
                      </span>
                    </span>
                  )}
                </p>
                {/* T7.4 — título bold uppercase (label-caps). */}
                <p className="label-caps mt-0.5 text-foreground">
                  {evento.titulo}
                </p>
                {/* T7.5 — descripción gris. */}
                <p className="mt-0.5 text-[11px] leading-4 normal-case text-muted-foreground">
                  {evento.detalle}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
