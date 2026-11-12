<!-- Checklist del PR — marca TODO antes de pedir revisión.
     Regla SEC-10: jamás commitear actas reales ni capturas con datos de
     jurados. Regla D90/D91: jamás reescribir historial sin autorización
     registrada. -->

## Qué cambia este PR

<!-- Resumen breve + referencia a la decisión D-xx si aplica. -->

## Checklist

- [ ] Gates verdes en local: `bun run typecheck`, `bun test` y el gate
      agregado del repo (`bun run verificar` en sup; en dig,
      `bash scripts/check-quality.sh` o `bun run verificar`).
- [ ] Si toca `packages/scanner-core`: cambio aplicado en ESPEJO (byte a byte
      en el repo hermano) y `qa-paridad-motor` en 20/20.
- [ ] Sin actas reales ni capturas con datos de jurados (SEC-10).
- [ ] Docs al día: CHANGELOG, decisión D-xx registrada (si aplica) y
      comentarios de código con la referencia que motiva cada pieza no obvia.
- [ ] Sin telemetría, analítica ni llamadas de red nuevas no documentadas.
