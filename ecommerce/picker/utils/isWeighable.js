/**
 * Detecta si un producto es pesable.
 *
 * La única fuente de verdad es el pedido de WooCommerce:
 * si el cliente eligió una unidad de peso (KL, LB, KG), es pesable.
 * Si pidió por unidades (UND) o no tiene unidad_medida, NO es pesable.
 *
 * El campo `unidad_medida` se extrae del meta `pa_unidad-de-medida-aproximado`
 * del line_item del pedido de WooCommerce.
 */

const WEIGHT_UNITS = ["kl", "kg", "kilo", "lb", "libra"];

export const isWeighable = (item) => {
  if (!item?.unidad_medida) return false;
  return WEIGHT_UNITS.includes(item.unidad_medida.toLowerCase());
};
