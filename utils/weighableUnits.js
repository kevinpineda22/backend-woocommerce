/**
 * Única fuente de verdad del BACKEND para identificar productos pesables.
 *
 * ⚠️ MANTENER EN SYNC con `ecommerce/shared/weighableUnits.js` (frontend ESM).
 * Si una lista se queda atrás, WooCommerce puede mandar una unidad nueva
 * (ej. "500g") y la detección falla en silencio — el picker deja de pedir peso.
 *
 * Conversiones kg/unidad pedida:
 *   KL / KG / KILO  → 1.000
 *   LB / LIBRA      → 0.4536
 *   500GR / 500G    → 0.500
 */

const WEIGHABLE_UNITS = [
  "kl",
  "kg",
  "kilo",
  "lb",
  "libra",
  "500gr",
  "500g",
  "500grs",
];

function isWeighableUnit(unidadMedida) {
  if (!unidadMedida) return false;
  return WEIGHABLE_UNITS.includes(unidadMedida.toString().toLowerCase());
}

function kgPerUnit(unidadMedida) {
  const u = (unidadMedida || "").toString().toLowerCase();
  if (u === "lb" || u === "libra") return 0.4536;
  if (u === "500gr" || u === "500g" || u === "500grs") return 0.5;
  return 1.0;
}

module.exports = { WEIGHABLE_UNITS, isWeighableUnit, kgPerUnit };
