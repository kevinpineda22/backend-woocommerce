/**
 * Detecta si un producto es pesable (fruver, carnicería, etc.)
 * Centralizado para evitar duplicación entre ProductCard y VistaPicker.
 */
export const isWeighable = (item) => {
  if (!item) return false;
  const txt = (
    item.name +
    " " +
    (item.categorias?.[0]?.name || "")
  ).toLowerCase();
  const isUnitPesable =
    item.unidad_medida &&
    ["kl", "kg", "kilo", "lb", "libra"].includes(
      item.unidad_medida.toLowerCase(),
    );
  return (
    isUnitPesable ||
    txt.includes("kg") ||
    txt.includes("gramos") ||
    txt.includes("fruver") ||
    txt.includes("carniceria")
  );
};
