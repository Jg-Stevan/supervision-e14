/**
 * PUNTO ÚNICO DE INYECCIÓN del repositorio (seam §0-9 / doc-header de
 * supervision-repository.ts): «en la integración al digitalizador se
 * reemplaza mockSupervisionRepository por la implementación real. Nada
 * más cambia.»
 *
 * Antes el mock estaba hardcodeado en 8 sitios del store
 * (datos-provider.tsx): el seam existía en el contrato pero no en el
 * código. Hoy TODOS los consumidores importan `supervisionRepository`
 * de este archivo — cambiar de implementación = editar ESTA línea
 * (p. ej. un repositorio REST/Prisma que implemente la misma interfaz
 * `SupervisionRepository`).
 */

import { mockSupervisionRepository } from "./mock-repository";
import type { SupervisionRepository } from "./supervision-repository";

export const supervisionRepository: SupervisionRepository =
  mockSupervisionRepository;
