// tools/mapeadorPasillos.js

const DEFINICION_PASILLOS = require("../data/categoriaPasillos");

// Función auxiliar para quitar acentos
const removeAccents = (str) => {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

// Generamos las reglas automáticamente basadas en la definición del usuario.
// Usamos la misma definición tanto para categorías como para nombres.
const REGLAS_PASILLOS = DEFINICION_PASILLOS.map((def, index) => ({
  keys: def.categorias,
  pasillo: def.pasillo,
  prioridad: index + 1, // Prioridad basada en el orden de la lista
}));

// Función de matching inteligente
const matchesKey = (text, key) => {
  const normalizedText = removeAccents(text).toLowerCase();
  const normalizedKey = removeAccents(key).toLowerCase();

  // Si la llave tiene espacios, buscamos la frase exacta (substring)
  if (normalizedKey.includes(" ")) {
    return normalizedText.includes(normalizedKey);
  }

  // Si es una sola palabra, usamos Regex con word boundaries
  // Permitimos plurales simples (s, es)
  try {
    // \b matches word boundaries. Example: \bgrano(s|es)?\b matches "grano", "granos" but NOT "granulado"
    const regex = new RegExp(`\\b${normalizedKey}(s|es)?\\b`, "i");
    return regex.test(normalizedText);
  } catch (e) {
    return normalizedText.includes(normalizedKey);
  }
};

/**
 * Determina el pasillo y prioridad de un producto basado en sus categorías Y su nombre
 * @param {Array} categoriasWC - Array de objetos de categorías de WooCommerce
 * @param {String} nombreProducto - (Opcional) El nombre del producto para búsqueda de respaldo
 */
const obtenerInfoPasillo = (categoriasWC, nombreProducto = "") => {
  // 1. Estrategia Principal: Búsqueda por NOMBRE DE CATEGORÍA
  if (categoriasWC && categoriasWC.length > 0) {
    const nombresCategorias = categoriasWC.map((c) => c.name || "").join(" ");

    for (const regla of REGLAS_PASILLOS) {
      if (regla.keys.some((key) => matchesKey(nombresCategorias, key))) {
        return { pasillo: regla.pasillo, prioridad: regla.prioridad };
      }
    }
  }

  // 2. Estrategia Fallback: Búsqueda por PALABRAS CLAVE en el NOMBRE DEL PRODUCTO
  // Reutilizamos las mismas reglas de pasillo para buscar en el nombre del producto
  const nombreParaBusqueda = nombreProducto || "";

  for (const regla of REGLAS_PASILLOS) {
    if (regla.keys.some((key) => matchesKey(nombreParaBusqueda, key))) {
      return { pasillo: regla.pasillo, prioridad: regla.prioridad };
    }
  }

  // 3. Default
  return { pasillo: "Otros", prioridad: 90 };
};

module.exports = { obtenerInfoPasillo };
