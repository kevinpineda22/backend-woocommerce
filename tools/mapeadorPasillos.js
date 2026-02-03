/**
 * CONFIGURACIÓN DE ORDEN DE RUTA (SERPENTEAR)
 * Este mapa define el ORDEN OFICIAL de recorrido para el picker.
 * El número indica la posición en la ruta (1 = Primero, 2 = Segundo, etc.)
 */
const ORDEN_RUTA = {
  2: 1,
  1: 2,
  3: 3,
  4: 4,
  6: 5,
  5: 6,
  7: 7,
  8: 8,
  10: 9,
  9: 10,
  11: 11,
  12: 12,
  13: 13,
  14: 14,
  Otros: 99, // Todo lo desconocido al final
};

/**
 * CONFIGURACIÓN DE PASILLOS Y SUS CATEGORÍAS (REGLAS DE MATCHING)
 */
const DEFINICION_PASILLOS = [
  // --- PRIORIDAD ALTA: Productos Específicos que pueden confundirse ---
  {
    pasillo: "6",
    nombre: "Café y Panadería",
    categorias: ["cafe", "chocolate", "pan", "tostada", "cafe molido", "cafe premium", "cafe soluble"],
  },
  {
    pasillo: "8",
    nombre: "Cuidado Personal",
    categorias: ["cuidado personal", "aseo personal", "higiene", "oral", "capilar", "corporal", "femenina", "bebe", "desodorante", "shampoo", "jabon de baño", "crema dental", "cremas corporales", "higiene capilar", "cremas detales"],
  },
  {
    pasillo: "9",
    nombre: "Aseo Hogar",
    categorias: ["aseo hogar", "limpieza hogar", "papel higienico", "escoba", "traperas", "bolsa basura", "vela", "limpia piso", "escobas", "fabuloso", "lavanda"],
  },
  {
    pasillo: "10",
    nombre: "Aseo Ropa",
    categorias: ["detergente", "suavizante", "ropa", "blanqueador", "jabon barra", "insecticidas", "detergente liquido", "detergente en polvo", "blanqueadores"],
  },

  // --- PRIORIDAD MEDIA: Alimentos ---
  {
    pasillo: "2",
    nombre: "Despensa Básica",
    categorias: ["huevo", "atun", "enlatado", "pasta", "spaghetti", "harina precocida", "huevos", "atunes", "enlatados", "pastas"],
  },
  {
    pasillo: "1",
    nombre: "Granos y Condimentos",
    categorias: ["arroz", "azucar", "grano", "sal", "salsa", "aderezo", "vinagre", "vinagretas", "sazonador", "panela", "panelas"],
  },
  {
    pasillo: "3",
    nombre: "Aceites y Harinas",
    categorias: ["harinas", "margarinas", "sopas", "aceite vegetal", "aceite soya", "aceite oliva", "aceite", "harina de trigo", "mantequilla", "crema"],
  },
  {
    pasillo: "4",
    nombre: "Polvos y Repostería",
    categorias: ["gelatina", "flan", "pudin", "reposteria", "leche larga vida", "refrescos en polvo", "arequipe"],
  },
  {
    pasillo: "5",
    nombre: "Galletas y Dulces",
    categorias: ["galleta", "dulce", "snack dulce", "avena", "pan dulce", "avenas", "galleta salada", "galleta saludable", "galletas", "modificadores"],
  },

  // --- OTROS ---
  {
    pasillo: "7",
    nombre: "Bebé y Adulto",
    categorias: ["adulto", "incontinencia", "pañal adulto", "pañitos humedos", "pañales", "cereales", "granola", "leche en polvo", "bebe", "pañal"],
  },
  {
    pasillo: "11",
    nombre: "Mascotas y Cocina",
    categorias: ["mascota", "perro", "gato", "cocina", "esponja", "guante", "mascotas", "esponjas", "guantes", "lavaplatos", "desengrasante"],
  },
  {
    pasillo: "12",
    nombre: "Bebidas y Desechables",
    categorias: ["jugo", "desechable", "vaso", "plato", "lonchera", "loncheras", "servilletas", "papel cocina", "desechables"],
  },
  {
    pasillo: "13",
    nombre: "Refrigerados y Carnes",
    categorias: ["refrigerado", "congelado", "carne", "pollo", "pescado", "jamon", "queso", "yogurt", "lacteos derivados", "lacteos", "cervezas", "mani", "golosinas", "nueces", "mexicano", "saludable", "carnes frias", "carniceria", "embutidos", "licores"],
  },
  {
    pasillo: "14",
    nombre: "Fruver",
    categorias: ["gaseosa", "agua", "bebida", "fruta", "verdura", "tomate", "cebolla", "papa", "gaseosas", "fruver", "pasabocas", "snacks", "medicamentos"],
  },
];

// Función auxiliar para quitar acentos
const removeAccents = (str) => {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

// Generamos las reglas automáticamente
const REGLAS_PASILLOS = DEFINICION_PASILLOS.map((def) => ({
  keys: def.categorias,
  pasillo: def.pasillo,
  nombre: def.nombre,
  prioridad: ORDEN_RUTA[def.pasillo] || 99,
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
  try {
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
    // FILTRO: Ignoramos la categoría genérica "Despensa"
    const categoriasValidas = categoriasWC.filter((c) => {
      if (!c.name) return false;
      const nombreNormalizado = removeAccents(c.name).toLowerCase().trim();
      return !nombreNormalizado.includes("despensa");
    });

    const nombresCategorias = categoriasValidas.map((c) => c.name || "").join(" ");

    for (const regla of REGLAS_PASILLOS) {
      if (regla.keys.some((key) => matchesKey(nombresCategorias, key))) {
        return { pasillo: regla.pasillo, prioridad: regla.prioridad };
      }
    }
  }

  // 2. Estrategia Fallback: Búsqueda por NOMBRE DEL PRODUCTO
  const nombreParaBusqueda = nombreProducto || "";

  for (const regla of REGLAS_PASILLOS) {
    if (regla.keys.some((key) => matchesKey(nombreParaBusqueda, key))) {
      return { pasillo: regla.pasillo, prioridad: regla.prioridad };
    }
  }

  // 3. Default
  return { pasillo: "Otros", prioridad: ORDEN_RUTA["Otros"] };
};

module.exports = { obtenerInfoPasillo };