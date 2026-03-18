/**
 * Detecta si un producto es pesable (fruver, carnicería, etc.)
 * Centralizado para evitar duplicación entre ProductCard y VistaPicker.
 *
 * IMPORTANTE: NO se usa el nombre del producto para detectar "kg"/"gramos"
 * porque productos empacados como "AZUCAR X 1 KG" no son pesables.
 * Solo se detecta por unidad_medida (KL, LB) o por categoría real (fruver/carnicería).
 */
export const isWeighable = (item) => {
  if (!item) return false;

  // 1. Unidad de medida pesable (KL = kilo, LB = libra)
  const isUnitPesable =
    item.unidad_medida &&
    ["kl", "kg", "kilo", "lb", "libra"].includes(
      item.unidad_medida.toLowerCase(),
    );

  // 2. Detección por CATEGORÍAS REALES (no por nombre del producto)
  const catReales = Array.isArray(item.categorias_reales)
    ? item.categorias_reales.join(" ").toLowerCase()
    : "";
  const catNormales = Array.isArray(item.categorias)
    ? item.categorias.map((c) => c.name).join(" ").toLowerCase()
    : "";
  const categoriesWords = `${catReales} ${catNormales}`.split(/[\s,.\-]+/);

  const fruverKeywords = [
    "fruver", "fruta", "frutas", "verdura", "verduras",
    "hortaliza", "hortalizas", "legumbre", "legumbres",
  ];
  const meatKeywords = [
    "carne", "carnes", "pollo", "pollos", "pescado", "pescados",
    "res", "cerdo", "carnicería", "carniceria", "embutido", "embutidos",
    "pescaderia", "pescadería", "marisco", "mariscos",
  ];
  const allWeighableKeywords = [...fruverKeywords, ...meatKeywords];
  const isCategoryWeighable = categoriesWords.some((w) =>
    allWeighableKeywords.includes(w),
  );

  return isUnitPesable || isCategoryWeighable;
};
