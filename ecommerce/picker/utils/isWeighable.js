/**
 * Detecta si un producto es pesable.
 *
 * La única fuente de verdad es el pedido de WooCommerce:
 * si el cliente eligió una unidad de peso (KL, LB, KG, 500gr, etc.), es pesable.
 * Si pidió por unidades (UND) o no tiene unidad_medida, NO es pesable.
 *
 * El campo `unidad_medida` se extrae del meta `pa_unidad-de-medida-aproximado`
 * del line_item del pedido de WooCommerce.
 *
 * Conversiones de peso por unidad:
 *   KL / KG / KILO  → 1.000 kg/unidad
 *   LB / LIBRA      → 0.4536 kg/unidad
 *   500GR / 500G    → 0.500 kg/unidad
 */

const WEIGHT_UNITS = [
  "kl",
  "kg",
  "kilo",
  "lb",
  "libra",
  "500gr",
  "500g",
  "500grs",
];

export const isWeighable = (item) => {
  if (!item?.unidad_medida) return false;
  return WEIGHT_UNITS.includes(item.unidad_medida.toLowerCase());
};

/**
 * Retorna los kg por unidad pedida según la unidad de medida.
 * Usar como fallback cuando no hay peso_total del scanner.
 */
export const kgPerUnit = (unidadMedida) => {
  const u = (unidadMedida || "").toLowerCase();
  if (u === "lb" || u === "libra") return 0.4536;
  if (u === "500gr" || u === "500g" || u === "500grs") return 0.5;
  return 1.0; // KL / KG / KILO → 1 kg por unidad
};
