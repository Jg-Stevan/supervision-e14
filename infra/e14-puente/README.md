# e14-puente — hub de actas (Cloudflare Worker + D1)

Worker desplegado que hace de PUENTE entre el digitalizador (`digielect14`)
y este panel: recibe actas del PWA y las sirve a `/api/supervision/remotas`.

- URL: https://e14-puente.julistevan02.workers.dev
- D1: `e14-envios-remoto-masiva` → tabla `actas_publicadas`
  (UNIQUE slot: id_enlace + mesa + formulario + pagina_index)
- Endpoints:
  - `POST /actas` ← `{dispositivo, actas: EntradaActaMasiva[]}` (tope 10/lote, CORS PWA)
  - `GET /actas?desde=<epoch ms>` → `{ok, ahora, total, actas[]}`
  - `GET /salud`

## Redesplegar

```bash
cd infra/e14-puente
CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<account> bunx wrangler@4 deploy
```

Fuente: `src/index.ts` (TypeScript, sin dependencias).
