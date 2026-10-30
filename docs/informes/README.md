# docs/informes/ — Registro auditable de la delegación

Sistema de documentación de las olas de refactor con agentes. Todo lo que cada agente
hizo, encontró y propuso queda persistido aquí (en git) para poder **auditar, verificar
y tomar acciones** después.

## Estructura

```
docs/informes/
  README.md                    ← este archivo (cómo auditar)
  ola-0/
    R1-pr.md · R2-pr.md        ← PR verbatim de los agentes (preservados por orquestador)
  ola-1/
    R3-pr.md … R6-pr.md        ← PR verbatim de los agentes
    RESUMEN-ola-1.md           ← auditoría consolidada del orquestador:
                                 estado, verificación independiente, duplicados/código
                                 muerto/optimizaciones, cola de decisiones del dueño,
                                 riesgos residuales
```

## Cómo auditar una ola (checklist del orquestador/dueño)

1. Leer el `RESUMEN-ola-N.md` (estado + verificación independiente + hallazgos consolidados).
2. Contrastar claims contra los `Rn-pr.md` verbatim (evidencia, riesgos, rollback).
3. Verificar por cuenta propia (no confiar en claims):
   - `git log --oneline <merge>` y `git diff --stat <merge>^..<merge>` (¿solo su zona?)
   - `bunx tsc --noEmit && bun run lint && bun test`
   - Spot-checks de los hallazgos que alimentan decisiones.
4. Ejecutar la **cola de decisiones del dueño** del RESUMEN (ítems numerados y priorizados).

## Contrato vigente (desde Ola 2)

Cada agente commitea su propio `docs/informes/<Rn>.md` con 10 secciones fijas:
resumen · cambios aplicados · duplicados detectados · código muerto/innecesario ·
optimizaciones aplicadas · optimizaciones NO aplicadas · riesgos y cobertura ·
decisiones sin dueño · evidencia real (comandos+salidas) · hallazgos fuera de zona.
El orquestador consolida al cerrar la ola en `RESUMEN-ola-N.md`.
