/** Ítem 3.6 (costura ②): shim + versión de S inyectada. */
import { configurarObsBase } from "@jg-stevan/scanner-core/obs-base/config";
import pkg from "../../../../../../package.json";

configurarObsBase({ versionApp: pkg.version });

export * from "@jg-stevan/scanner-core/obs-base/identidad";
