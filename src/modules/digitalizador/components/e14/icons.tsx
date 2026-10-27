/**
 * Iconos inline (copiados de los code.html del zip v2 — fuente de verdad).
 * Sin dependencias de librería de iconos: cada SVG calca el diseño original.
 */

type IconProps = { className?: string };


export const CameraNavIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg className={`${className} fill-current`} viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
  </svg>
);


export const RefreshIcon = ({ className = "w-3.5 h-3.5" }: IconProps) => (
  <svg
    className={`${className} fill-none stroke-current stroke-2`}
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

export const WarnTriangleIcon = ({ className = "w-3.5 h-3.5" }: IconProps) => (
  <svg
    className={`${className} stroke-current stroke-2 fill-none`}
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

export const RotateIcon = ({ className = "w-3.5 h-3.5" }: IconProps) => (
  <svg
    className={`${className} stroke-current stroke-2 fill-none`}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="M21.5 2v6h-6" />
    <path d="M21.34 15.57a10 10 0 1 1-.57-8.38" />
  </svg>
);


export const ChevronDownIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg
    className={`${className} stroke-current stroke-2 fill-none`}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const ShieldCheckIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg
    className={`${className} stroke-current stroke-2 fill-none`}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const DocScannerIcon = ({ className = "w-9 h-9" }: IconProps) => (
  <svg
    className={`${className} stroke-current stroke-[1.5] fill-none`}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M7 12h10M7 8h10M8 16h4" />
  </svg>
);

export const SensorsIcon = ({ className = "w-3 h-3" }: IconProps) => (
  <svg
    className={`${className} stroke-current stroke-2 fill-none`}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="M12 12a2 2 0 1 0 0-.001" />
    <path d="M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
  </svg>
);

export const CheckIcon = ({
  className = "w-3.5 h-3.5",
  strokeWidth = 2,
}: IconProps & { strokeWidth?: number }) => (
  <svg
    className={`${className} stroke-current fill-none`}
    style={{ strokeWidth }}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export const DownloadIcon = ({ className = "w-3.5 h-3.5" }: IconProps) => (
  <svg
    className={`${className} fill-none stroke-current stroke-2`}
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
  </svg>
);

/** Sliders (F2 — gatillo FILTROS de la barra de revisión; trazo calca el
 *  `sliders-horizontal` de lucide, mismo patrón SVG inline del archivo). */
export const SlidersIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg
    className={`${className} stroke-current stroke-2 fill-none`}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />
  </svg>
);

/** Sparkles (F4 — DETECCIÓN AUTOMÁTICA del editor de recorte; trazo calca el
 *  `sparkles` de lucide, mismo patrón SVG inline del archivo). */
export const SparklesIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg
    className={`${className} stroke-current stroke-2 fill-none`}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
    <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
    <path d="M5 16l.7 1.6L7.3 18l-1.6.7L5 20.3l-.7-1.6L2.7 18l1.6-.4L5 16z" />
  </svg>
);

/** ScanText (F-OCR/D39 — botón TEXTO de la barra + título del sheet; trazo
 *  calca el `scan-text` de lucide, mismo patrón SVG inline del archivo). */
export const ScanTextIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg
    className={`${className} stroke-current stroke-2 fill-none`}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <path d="M7 8h8" />
    <path d="M7 12h10" />
    <path d="M7 16h6" />
  </svg>
);

/** Copy (F-OCR/D39 — botón «Copiar texto» del sheet; trazo calca el `copy`
 *  de lucide, mismo patrón SVG inline del archivo). */
export const CopyIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg
    className={`${className} stroke-current stroke-2 fill-none`}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

/** LoaderCircle (F-OCR/D39 — spinner «Reconociendo texto…»; trazo calca el
 *  `loader-circle` de lucide; se usa con clase animate-spin). */
export const LoaderIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg
    className={`${className} stroke-current stroke-2 fill-none`}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
  </svg>
);

/** MapPin (SPEC-cabecera-clasificacion §5 — cabecera del panel de corrección
 *  de ubicación; trazo calca el `map-pin` de lucide, mismo patrón SVG inline). */
export const MapPinIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg
    className={`${className} stroke-current stroke-2 fill-none`}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

/** FolderInput (SPEC-e14-cyber-neon-captura §1/§8 — botón IMPORTAR de la fila
 *  de disparo: carpeta con flecha entrando; trazo calca el `folder-input` de
 *  lucide, strokeWidth 1.8 como pide la spec). */
export const FolderImportIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg
    className={`${className} stroke-current stroke-[1.8] fill-none`}
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1" />
    <path d="M2 13h10" />
    <path d="m9 16 3-3-3-3" />
  </svg>
);

/* ══════════════════════════════════════════════════════════════════
   STITCH REDESIGN (SPEC-e14-redesign-stitch §1) — SVG inline del ZIP
   copiados TAL CUAL (download/stitch-e14-redesign/...). Se usan en el
   chrome re-vestido; los paths/valores son verbatim de los code.html.
   ══════════════════════════════════════════════════════════════════ */

/** Grid de la píldora IA del escaneo (mock 1: puntos 4×4 + 4 rects rx 1.5). */
export const StitchGridIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden>
    <path
      d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"
      fill="currentColor"
      opacity="0.2"
    />
    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
  </svg>
);

/** SPRINT-B (B3): StitchFrameIcon BORRADO — su único consumidor era el botón
 *  amarillo del menú §6.3 perdido en el zip 4f9c871 (audit #7: derivado).
 *  grep src/ scripts/ = solo esta definición; el import muerto ya se había
 *  quitado en 2c011a2 (bucket A). El dueño confirma el abandono del menú
 *  (el segmented CÁMARA/SIM/SUBIR es la UI vigente). */

/** Importar del dock (mock 1: documento con flecha descendente). */
export const StitchImportIcon = ({ className = "w-6 h-6" }: IconProps) => (
  <svg className={`${className} stroke-current fill-none`} strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden>
    <path
      d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M12 11v5m0 0l-2-2m2 2l2-2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Documento del interior del obturador (mock 1, strokeWidth 2). */
export const StitchShutterDocIcon = ({ className = "w-8 h-8" }: IconProps) => (
  <svg
    className={`${className} stroke-current fill-none drop-shadow`}
    strokeWidth="2"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Rayo del Flash del dock (mock 1). */
export const StitchBoltIcon = ({ className = "w-6 h-6" }: IconProps) => (
  <svg
    className={`${className} stroke-current fill-none`}
    strokeWidth="2"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Cámara del ítem ESCANEAR de la nav (mock, strokeWidth 2). */
export const StitchCameraIcon = ({ className = "w-5 h-5" }: IconProps) => (
  <svg
    className={`${className} stroke-current fill-none`}
    strokeWidth="2"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path
      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Documento del ítem ACTAS de la nav (mock, strokeWidth 1.8). */
export const StitchDocIcon = ({ className = "w-5 h-5" }: IconProps) => (
  <svg
    className={`${className} stroke-current fill-none`}
    strokeWidth="1.8"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Cuadrícula 2×2 del ítem RESUMEN de la nav (mock, strokeWidth 1.8). */
export const StitchGrid2Icon = ({ className = "w-5 h-5" }: IconProps) => (
  <svg
    className={`${className} stroke-current fill-none`}
    strokeWidth="1.8"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path
      d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** KIT e14-carga-masiva-v1 (T4): ítem MASIVA de la nav — capas apiladas
 *  desfasadas (pila de fotos), outline 1.8 como el resto de la nav. */
export const StitchStackIcon = ({ className = "w-5 h-5" }: IconProps) => (
  <svg
    className={`${className} stroke-current fill-none`}
    strokeWidth="1.8"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path
      d="M9 3h10a2 2 0 012 2v10M7 7h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Lupa-ojo del CTA REVISIÓN HUMANA (mock rechazada_2, strokeWidth 2). */
export const StitchEyeIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg
    className={`${className} stroke-current fill-none`}
    strokeWidth="2"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
    <path
      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Badge giratorio de los CTAs de repetir (mock, strokeWidth 2.5). */
export const StitchSpinIcon = ({ className = "w-3.5 h-3.5" }: IconProps) => (
  <svg
    className={`${className} animate-spin stroke-current fill-none`}
    strokeWidth="2.5"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.03 8.03 0 01-15.357-2m15.357 2H15"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Recortar de la fila de acciones (mock rechazada_1, strokeWidth 2). */
export const StitchCropIcon = ({ className = "w-3.5 h-3.5" }: IconProps) => (
  <svg
    className={`${className} stroke-current fill-none`}
    strokeWidth="2"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="M6 2v14a2 2 0 002 2h14" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 22V8a2 2 0 00-2-2H2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Rotar 90° de la fila de acciones (mock rechazada_1, strokeWidth 2). */
export const StitchRotateIcon = ({ className = "w-3.5 h-3.5" }: IconProps) => (
  <svg
    className={`${className} stroke-current fill-none`}
    strokeWidth="2"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.03 8.03 0 01-15.357-2m15.357 2H15"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** Nube de transmisión del TopBar (mock — check, fill). */
export const StitchCloudCheckIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg className={`${className} fill-current animate-pulse`} viewBox="0 0 24 24" aria-hidden>
    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM10 13.6l-2.6-2.6L6 12.4l4 4 8-8-1.4-1.4-6.6 6.6z" />
  </svg>
);

/** Retro «←» del TopBar (mock, strokeWidth 2.5). */
export const StitchArrowLeftIcon = ({ className = "w-6 h-6" }: IconProps) => (
  <svg
    className={`${className} stroke-current fill-none`}
    strokeWidth="2.5"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Fuente: lucide-react «gauge» (mismo path que usa la pill del medidor de
// captura del lab — apps/scanner-lab/src/components/scanner/CameraView.tsx
// L3410-3414 usa <Gauge/> de lucide). KIT camara-visor-v1 G7: e14 no tiene
// lucide-react (cero dependencias nuevas) → el path EXACTO del icono,
// re-vestido con el patrón stroke de los iconos propios.
export const GaugeIcon = ({ className = "w-4 h-4" }: IconProps) => (
  <svg
    className={`${className} stroke-current fill-none`}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    viewBox="0 0 24 24"
    aria-hidden
  >
    <path d="m12 14 4-4" />
    <path d="M3.34 19a10 10 0 1 1 17.32 0" />
  </svg>
);
