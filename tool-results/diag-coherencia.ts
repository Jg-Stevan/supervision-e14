/**
 * Diagnóstico temporal (no rastreado): coherencia pct ↔ estado en el mock.
 * Regla del dueño: si todas las actas de un puesto fueron recibidas
 * (100%), el puesto debe estar COMPLETO (verde).
 */
import { initSupervisionDatos, mockSupervisionRepository } from "../src/modules/supervision/data/mock-repository";

const init = initSupervisionDatos();
console.log("init:", JSON.stringify(init));

const puestos = await mockSupervisionRepository.getPuestos();

// 1) 100/100 pero NO COMPLETO (contradicción visible en la matriz).
const cienPeroNoVerde = puestos.filter(
  (p) => p.pctDelegado === 100 && p.pctTransmision === 100 && p.estadoGlobal !== "COMPLETO"
);
console.log("\n[1] 100%/100% pero estado ≠ COMPLETO:", cienPeroNoVerde.length);
for (const p of cienPeroNoVerde.slice(0, 8)) {
  console.log(`   ${p.pais} · ${p.puesto} · ${p.numeroMesas} mesas · deleg=${p.pctDelegado} trans=${p.pctTransmision} · ${p.estadoGlobal} · t=${p.minutosDesdeCierre}min`);
}

// 2) Alguna barra en 100 pero NO COMPLETO.
const algunaCien = puestos.filter(
  (p) => (p.pctDelegado === 100 || p.pctTransmision === 100) && p.estadoGlobal !== "COMPLETO"
);
console.log("\n[2] Alguna barra = 100% pero estado ≠ COMPLETO:", algunaCien.length);
const porEstado: Record<string, number> = {};
for (const p of algunaCien) porEstado[p.estadoGlobal] = (porEstado[p.estadoGlobal] ?? 0) + 1;
console.log("   por estado:", JSON.stringify(porEstado));

// 3) Distribución global de estados (KPIs).
const dist: Record<string, number> = {};
for (const p of puestos) dist[p.estadoGlobal] = (dist[p.estadoGlobal] ?? 0) + 1;
console.log("\n[3] Distribución de estados:", JSON.stringify(dist), "total", puestos.length);

// 4) COMPLETO con alguna barra < 100 (caso inverso).
const verdeNoCien = puestos.filter(
  (p) => p.estadoGlobal === "COMPLETO" && (p.pctDelegado !== 100 || p.pctTransmision !== 100)
);
console.log("\n[4] COMPLETO con barra < 100%:", verdeNoCien.length);

// 5) Coherencia hora actual = 16:00 + transcurrido (por construcción).
const incoherentesHora = puestos.filter((p) => {
  const total = 16 * 60 + p.minutosDesdeCierre;
  const m = ((total % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  const sufijo = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return p.horaActualLocal !== `${h12}:${mm} ${sufijo}`;
});
console.log("\n[5] Hora actual incoherente con 16:00+t:", incoherentesHora.length);

// 6) Muestra de puestos de 1 mesa no COMPLETO (candidatos a la contradicción).
const unaMesa = puestos.filter((p) => p.numeroMesas === 1 && p.estadoGlobal !== "COMPLETO");
console.log("\n[6] Puestos de 1 mesa sin COMPLETO:", unaMesa.length);
for (const p of unaMesa.slice(0, 8)) {
  console.log(`   ${p.pais} · ${p.puesto} · deleg=${p.pctDelegado} trans=${p.pctTransmision} · ${p.estadoGlobal}`);
}
