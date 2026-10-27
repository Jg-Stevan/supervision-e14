import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // KIT carga-masiva-supervision-v1 (D27): el módulo digitalizador
  // trasplantado (src/modules/digitalizador/**) llega con las reglas de su
  // repo origen (digielect14) — se conservan para no reescribir el motor.
  {
    rules: {
      // TypeScript
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/prefer-as-const": "off",
      "@typescript-eslint/no-unused-disable-directive": "off",

      // React (reglas del repo origen — ver eslint.config.mjs de digielect14)
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react/no-unescaped-entities": "off",
      "react/display-name": "off",
      "react/prop-types": "off",
      "react-compiler/react-compiler": "off",

      // Next.js
      "@next/next/no-img-element": "off",
      "@next/next/no-html-link-for-pages": "off",

      // General
      "prefer-const": "warn",
      "no-unused-vars": "off",
      "no-console": "off",
      "no-debugger": "error",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-irregular-whitespace": "off",
      "no-case-declarations": "off",
      "no-fallthrough": "off",
      "no-mixed-spaces-and-tabs": "off",
      "no-redeclare": "off",
      "no-undef": "off",
      "no-unreachable": "error",
      "no-useless-escape": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendor del motor digitalizador (D27): jsQR UMD vendido byte-exacto +
    // assets del core copiados (opencv/detection-worker/onnxruntime) — JS de
    // terceros/minificado, no código fuente del repo (mismo criterio del
    // repo origen).
    "src/modules/digitalizador/lib/e14/masiva/vendor/**",
    "public/vendor/**",
    "public/scanner/**",
    "public/wasm/**",
    // Infraestructura del entorno (no código del producto).
    "skills/**",
    "tool-results/**",
    "download/**",
    "upload/**",
    "mini-services/**",
    "examples/**",
    ".zscripts/**",
  ]),
]);

export default eslintConfig;
