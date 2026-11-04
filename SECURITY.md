# Seguridad

## Reportar una vulnerabilidad

No abras un issue público. Escribe al mantenedor del repositorio
(`@Jg-Stevan` en GitHub) con:

- descripción del problema y componente afectado;
- pasos mínimos para reproducirlo;
- impacto estimado (confidencialidad, integridad del acta, disponibilidad);
- versión o commit donde lo observaste.

Recibirás acuse de recibo y un plan de corrección. No publiques detalles hasta
que exista un arreglo disponible.

## Modelo de amenaza

La aplicación es un **export estático** que corre en el navegador del usuario:

- **Sin backend ni cuentas.** No hay API propia, ni base de datos remota, ni
  envío de actas a terceros. La publicación vive en memoria de sesión.
- **Datos locales.** Cola, histórico de deduplicación y métricas se guardan en
  IndexedDB del navegador. Borrar los datos del sitio los elimina (y también
  restablece el estado de demostración).
- **Sidecar opcional.** El OCR nativo escucha en `127.0.0.1:8765`. El servidor
  aplica una allow-list de orígenes y cabecera *Private Network Access*; aun así,
  es un binario local sin firma: descárgalo solo desde el release oficial del
  repositorio.
- **Documentos públicos.** Las actas incluidas son documentos electorales
  públicos, recomprimidos. No se versionan fotos de particulares ni datos
  personales.

## Prácticas del repositorio

- Sin secretos en el código: los tokens de despliegue viven en *GitHub Secrets*.
- Dependencias fijadas por `bun.lock`; `bun install --frozen-lockfile` en CI.
- Cabeceras COOP/COEP en Cloudflare Pages habilitan `SharedArrayBuffer`; no
  introduzcas scripts de terceros que rompan el aislamiento.
- No se aceptan PRs que añadan telemetría, analítica o llamadas de red no
  documentadas.
- Los binarios vendidos (modelos, wasm, diccionarios) se verifican por origen y
  tamaño; `.gitattributes` evita que CRLF los corrompa.
