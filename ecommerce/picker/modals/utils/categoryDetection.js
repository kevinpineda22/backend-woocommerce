/**
 * Detección de categorías de producto (carnicería, fruver) basada en categorías reales.
 * NUNCA se basa en el nombre del producto para evitar falsos positivos
 * (ej: "AZUCAR X 1 KG" no es pesable).
 */

const MEAT_KEYWORDS = [
  "carne", "carnes", "pollo", "pollos", "pescado", "pescados",
  "res", "cerdo", "carnicería", "carniceria", "embutido", "embutidos",
  "chorizo", "pezuña", "costilla", "chuleta", "lomo", "tocino",
  "morrillo", "pechuga", "alas", "salchicha", "salchichas",
  "pescaderia", "pescadería", "marisco", "mariscos",
  "camaron", "camarones",
];

const FRUVER_KEYWORDS = [
  "fruver", "fruta", "frutas", "verdura", "verduras",
  "hortaliza", "hortalizas", "legumbre", "legumbres",
];

/**
 * Extrae las palabras de las categorías de un item.
 * Soporta tanto categorias_reales (array de strings) como categorias (array de {name}).
 * @param {object} item
 * @returns {string[]} Palabras individuales en minúscula.
 */
const getCategoryWords = (item) => {
  if (!item) return [];
  const catReales = Array.isArray(item.categorias_reales)
    ? item.categorias_reales.join(" ").toLowerCase()
    : "";
  const catNormales = Array.isArray(item.categorias)
    ? item.categorias.map((c) => c.name).join(" ").toLowerCase()
    : "";
  // Soporta categorías del SubstituteModal (viene como item.categories)
  const catSearch = Array.isArray(item.categories)
    ? item.categories.map((c) => c.name).join(" ").toLowerCase()
    : "";
  return `${catReales} ${catNormales} ${catSearch}`.split(/[\s,.\-]+/);
};

/**
 * Detecta si un item es de carnicería basándose en sus categorías.
 * @param {object} item - Item con categorias/categorias_reales.
 * @returns {boolean}
 */
export const detectMeat = (item) => {
  if (!item) return false;
  const words = getCategoryWords(item);
  return words.some((w) => MEAT_KEYWORDS.includes(w));
};

/**
 * Detecta si un item es de fruver basándose en sus categorías o unidad de medida pesable.
 * Si ya es carnicería, retorna false (carnicería tiene prioridad).
 * @param {object} item - Item con categorias/categorias_reales/unidad_medida.
 * @returns {boolean}
 */
export const detectFruver = (item) => {
  if (!item || detectMeat(item)) return false;
  const words = getCategoryWords(item);
  const isWeighableUnit =
    item.unidad_medida &&
    ["kl", "kg", "kilo", "lb", "libra"].includes(
      item.unidad_medida.toLowerCase(),
    );
  return isWeighableUnit || words.some((w) => FRUVER_KEYWORDS.includes(w));
};
