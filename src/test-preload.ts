/**
 * Preload de la suite (`bunfig.toml` → [test].preload).
 *
 * Auditoría 2026-11-11 (#4/#7): el ANCLA DEMO (acta #A92-F de Roma mesa 001
 * + notificaciones/anomalías sembradas) vive detrás del flag
 * `anclaDemoSupervision`, default OFF. Bun comparte el registro de módulos
 * entre archivos de test y `initSupervisionDatos()` memoiza la siembra, así
 * que el ancla se activa UNA vez aquí: cualquier archivo que lea el repo ve
 * el guion del mockup sin depender del orden de imports.
 */
import { configurarAnclaDemo } from "./modules/supervision/data/ancla-demo";

configurarAnclaDemo(true);
