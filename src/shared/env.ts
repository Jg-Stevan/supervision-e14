/**
 * Capa shared (R2) — entorno.
 *
 * PUBLIC_BASE único: hoy la expresión `process.env.NEXT_PUBLIC_BASE_PATH ?? ""`
 * está duplicada ×8 (reporte 04 §B2 #10):
 *
 *   · digitalizador/lib/e14/divipol.ts:57
 *   · digitalizador/lib/e14/flags.ts:18
 *   · digitalizador/lib/e14/ocr/tesseract-ocr.ts:23
 *   · digitalizador/lib/e14/ocr/rapidocr.ts:48
 *   · digitalizador/lib/e14/masiva/sondeo-qr.client.ts:54
 *   · digitalizador/lib/e14/masiva/prescan-qr.client.ts:47
 *   · digitalizador/lib/e14/masiva/capa0-qr.client.ts:49
 *   · digitalizador/lib/e14/masiva/identidad-qr.ts:242 (inline en locateFile)
 *
 * MISMA expresión, nueva casa (patrón «mover sin cambiar» — doctrina
 * qr-pixeles/DICTAMEN-e73 §3.1). Cero dependencias. SSR/node-safe: en el
 * servidor Next resuelve la env var; sin ella → "" (rutas relativas).
 */
export const PUBLIC_BASE: string = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
