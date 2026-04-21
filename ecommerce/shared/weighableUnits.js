/**
 * Única fuente de verdad del FRONTEND para identificar productos pesables.
 *
 * ⚠️ MANTENER EN SYNC con `utils/weighableUnits.js` (backend CJS).
 *
 * WooCommerce envía la unidad en el meta `pa_unidad-de-medida-aproximado`
 * (tomamos `display_value`). Si el cliente eligió KL/KG/LB/500gr, es pesable.
 *
 * Si esta lista se duplica en varios archivos se corrompe la detección — todo
 * código que necesite saber si una unidad es pesable DEBE importar de aquí.
 *
 * Conversiones de peso por unidad pedida:
 *   KL / KG / KILO  → 1.000 kg/unidad
 *   LB / LIBRA      → 0.4536 kg/unidad
 *   500GR / 500G    → 0.500 kg/unidad
 */

export const WEIGHABLE_UNITS = [
  "kl",
  "kg",
  "kilo",
  "lb",
  "libra",
  "500gr",
  "500g",
  "500grs",
];

export const isWeighableUnit = (unidadMedida) => {
  if (!unidadMedida) return false;
  return WEIGHABLE_UNITS.includes(unidadMedida.toString().toLowerCase());
};

export const kgPerUnit = (unidadMedida) => {
  const u = (unidadMedida || "").toString().toLowerCase();
  if (u === "lb" || u === "libra") return 0.4536;
  if (u === "500gr" || u === "500g" || u === "500grs") return 0.5;
  return 1.0;
};

/**
 * Sufijo corto para mostrar al lado de la cantidad pedida.
 * Ej: "2 LB", "3 KL", "4 500g"
 */
export const cantUnitSuffix = (unidadMedida) => {
  const u = (unidadMedida || "").toString().toLowerCase();
  if (u === "lb" || u === "libra") return "LB";
  if (u === "500gr" || u === "500g" || u === "500grs") return "500g";
  return "KL";
};
