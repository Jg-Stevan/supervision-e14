/** FASE 2: loader zxing del paquete; publicBase de S inyectado. */
import { configurarPublicBase } from "@jg-stevan/scanner-core/dominio/entorno";
import { PUBLIC_BASE } from "@/shared/env";

configurarPublicBase(PUBLIC_BASE);

export * from "@jg-stevan/scanner-core/qr/qr-zxing";
