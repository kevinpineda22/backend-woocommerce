/**
 * Detección de categorías de producto (carnicería, fruver).
 *
 * Reglas:
 *   1. unidad_medida decide si es pesable (kg, lb, kilo, libra, kl)
 *   2. Categorías solo distinguen carne vs fruver
 *   3. Pesable + categoría de carne → carnicería
 *   4. Pesable + NO categoría de carne → fruver
 *   5. NO pesable → flujo normal
 */

const MEAT_KEYWORDS = [
  "carne", "carnes", "pollo", "pollos", "pescado", "pescados",
  "res", "cerdo", "carnicería", "carniceria", "embutido", "embutidos",
  "chorizo", "pezuña", "costilla", "chuleta", "lomo", "tocino",
  "morrillo", "pechuga", "alas", "salchicha", "salchichas",
  "pescaderia", "pescadería", "marisco", "mariscos",
  "camaron", "camarones",
];

const WEIGHABLE_UNITS = ["kl", "kg", "kilo", "lb", "libra"];

/**
 * Determina si un producto es pesable por su unidad de medida.
 * @param {object} item
 * @returns {boolean}
 */
const isWeighable = (item) => {
  if (!item?.unidad_medida) return false;
  return WEIGHABLE_UNITS.includes(item.unidad_medida.toLowerCase());
};

/**
 * Extrae las palabras de las categorías de un item.
 * Soporta categorias_reales (array de strings), categorias (array de {name}),
 * y categories (SubstituteModal, array de {name}).
 * @param {object} item
 * @returns {string[]}
 */
const getCategoryWords = (item) => {
  if (!item) return [];
  const catReales = Array.isArray(item.categorias_reales)
    ? item.categorias_reales.join(" ").toLowerCase()
    : "";
  const catNormales = Array.isArray(item.categorias)
    ? item.categorias.map((c) => c.name).join(" ").toLowerCase()
    : "";
  const catSearch = Array.isArray(item.categories)
    ? item.categories.map((c) => c.name).join(" ").toLowerCase()
    : "";
  return `${catReales} ${catNormales} ${catSearch}`.split(/[\s,.\-]+/);
};

/**
 * Detecta si un item es de carnicería.
 * Requiere: unidad pesable + categoría de carne.
 * @param {object} item
 * @returns {boolean}
 */
export const detectMeat = (item) => {
  if (!item || !isWeighable(item)) return false;
  const words = getCategoryWords(item);
  return words.some((w) => MEAT_KEYWORDS.includes(w));
};

/**
 * Detecta si un item es de fruver.
 * Requiere: unidad pesable + NO ser carnicería.
 * @param {object} item
 * @returns {boolean}
 */
export const detectFruver = (item) => {
  if (!item || !isWeighable(item)) return false;
  return !detectMeat(item);
};
