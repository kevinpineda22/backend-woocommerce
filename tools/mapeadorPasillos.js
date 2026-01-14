// tools/mapeadorPasillos.js

/**
 * MAPA DE PASILLOS POR CATEGORÍA
 *
 * ESTRATEGIA:
 * 1. Priorizamos la CATEGORÍA de WooCommerce (Más preciso).
 * 2. Si no hay match de categoría, usamos palabras clave en el NOMBRE (Fallback menos preciso pero necesario).
 */

const REGLAS_CATEGORIAS = [
  // --- PRIORIDAD 1: PASILLO 2 (Despensa Básica) ---
  {
    keys: ["enlatado", "conserva", "pasta", "harina precocida", "huevo"],
    pasillo: "2",
    prioridad: 1,
  },

  // --- PRIORIDAD 2: PASILLO 1 (Granos y Condimentos) ---
  {
    keys: [
      "grano",
      "arroz",
      "legumbre",
      "condimento",
      "salsa",
      "aderezo",
      "azucar",
      "sal",
    ],
    pasillo: "1",
    prioridad: 2,
  },

  // --- PRIORIDAD 3: PASILLO 3 (Aceites y Harinas) ---
  // NOTA: "Aceite" como categoría aquí NO confundirá con "Aceite de Bebé" porque esa categoría será "Bebé"
  {
    keys: ["aceite", "grasa", "manteca", "harina", "sopa", "crema instantanea"],
    pasillo: "3",
    prioridad: 3,
  },

  // --- PRIORIDAD 4: PASILLO 4 (Lácteos y Repostería) ---
  {
    keys: ["leche", "reposteria", "gelatina", "postre en polvo"],
    pasillo: "4",
    prioridad: 4,
  },

  // --- PRIORIDAD 5: PASILLO 6 (Desayuno y Café) ---
  {
    keys: ["cafe", "café", "chocolate de mesa", "panaderia", "pan"],
    pasillo: "6",
    prioridad: 5,
  },

  // --- PRIORIDAD 6: PASILLO 5 (Galletas y Snacks Dulces) ---
  {
    keys: ["galleta", "dulce", "confiteria", "snack dulce"],
    pasillo: "5",
    prioridad: 6,
  },

  // --- PRIORIDAD 7: PASILLO 7 (Bebé y Adulto) ---
  {
    keys: [
      "bebe",
      "bebé",
      "pañal",
      "infantil",
      "incontinencia",
      "cuidado adulto",
    ],
    pasillo: "7",
    prioridad: 7,
  },

  // --- PRIORIDAD 8: PASILLO 8 (Cuidado Personal) ---
  {
    keys: [
      "cuidado personal",
      "aseo personal",
      "belleza",
      "higiene",
      "oral",
      "capilar",
      "corporal",
    ],
    pasillo: "8",
    prioridad: 8,
  },

  // --- PRIORIDAD 9: PASILLO 10 (Aseo Ropa) ---
  {
    keys: ["lavanderia", "cuidado ropa", "detergente"],
    pasillo: "10",
    prioridad: 9,
  },

  // --- PRIORIDAD 10: PASILLO 9 (Aseo Hogar y Papel) ---
  {
    keys: [
      "aseo hogar",
      "limpieza hogar",
      "papel higienico",
      "papel",
      "desechable",
    ],
    pasillo: "9",
    prioridad: 10,
  },

  // --- PRIORIDAD 11: PASILLO 11 (Mascotas y Cocina) ---
  {
    keys: ["mascota", "perro", "gato", "limpieza cocina"],
    pasillo: "11",
    prioridad: 11,
  },

  // --- PRIORIDAD 12: PASILLO 12 (Bebidas y Pasabocas) ---
  {
    keys: ["bebida", "gaseosa", "jugo", "agua", "snack salado", "pasabocas"],
    pasillo: "12",
    prioridad: 12,
  },

  // --- PRIORIDAD 13: PASILLO 13 (Refrigerados y Frescos) ---
  {
    keys: [
      "refrigerado",
      "congelado",
      "lacteo frio",
      "queso",
      "jamon",
      "embutido",
      "carne",
      "pescado",
      "pollo",
    ],
    pasillo: "13",
    prioridad: 13,
  },

  // --- PRIORIDAD 14: PASILLO 14 (Frutas y Verduras) ---
  {
    keys: ["fruta", "verdura", "vegetal", "fruver"],
    pasillo: "14",
    prioridad: 14,
  },
];

// Fallback: Si no tiene categorías claras, usamos el nombre del producto
const REGLAS_KEYWORDS_NOMBRE = [
  // --- PRIORIDAD 1: PASILLO 2 ---
  {
    keywords: [
      "huevo",
      "atun",
      "enlatado",
      "pasta",
      "spaghetti",
      "macarron",
      "fideo",
    ],
    pasillo: "2",
    prioridad: 1,
  },
  // --- PRIORIDAD 2: PASILLO 1 ---
  {
    keywords: [
      "arroz",
      "azucar",
      "grano",
      "lenteja",
      "frijol",
      "blanquillo",
      "garbanzo",
      "vinagreta",
      "salsa",
      "sazonador",
      "aderezo",
      "mayonesa",
      "mostaza",
    ],
    pasillo: "1",
    prioridad: 2,
  },
  // --- PRIORIDAD 3: PASILLO 3 ---
  {
    keywords: [
      "harina",
      "margarina",
      "mantequilla",
      "sopa",
      "crema",
      "aceite",
      "manteca",
      "soya",
      "oliva",
      "girasol",
    ],
    pasillo: "3",
    prioridad: 3,
  },
  // --- PRIORIDAD 4: PASILLO 4 ---
  {
    keywords: [
      "refresco",
      "polvo",
      "gelatina",
      "reposteria",
      "arequipe",
      "leche larga vida",
      "leche uht",
      "leche entera",
      "leche deslactosada",
    ],
    pasillo: "4",
    prioridad: 4,
  },
  // --- PRIORIDAD 5: PASILLO 6 ---
  {
    keywords: ["pan", "tostada", "calado", "chocolate", "cafe", "cocoa"],
    pasillo: "6",
    prioridad: 5,
  },
  // --- PRIORIDAD 6: PASILLO 5 ---
  {
    keywords: [
      "galleta",
      "avena",
      "saltin",
      "wafer",
      "dulce",
      "ponque",
      "brownie",
    ],
    pasillo: "5",
    prioridad: 6,
  },
  // --- PRIORIDAD 7: PASILLO 7 ---
  {
    keywords: [
      "pañal",
      "bebe",
      "humedos",
      "toallita",
      "cereal",
      "leche en polvo",
      "granola",
      "adulto",
      "incontinencia",
    ],
    pasillo: "7",
    prioridad: 7,
  },
  // --- PRIORIDAD 8: PASILLO 8 ---
  {
    keywords: [
      "intima",
      "toalla higienica",
      "protector",
      "crema dental",
      "cepillo",
      "enjuague",
      "bucal",
      "corporal",
      "jabon de baño",
      "jabon tocador",
      "shampoo",
      "capilar",
      "acondicionador",
      "desodorante",
      "afeitadora",
      "talco",
    ],
    pasillo: "8",
    prioridad: 8,
  },
  // --- PRIORIDAD 9: PASILLO 10 ---
  {
    keywords: [
      "jabon barra",
      "detergente",
      "lavadora",
      "insecticida",
      "blanqueador",
      "suavizante",
      "ropa",
      "clorox",
      "varsol",
    ],
    pasillo: "10",
    prioridad: 9,
  },
  // --- PRIORIDAD 10: PASILLO 9 ---
  {
    keywords: [
      "escoba",
      "papel higienico",
      "trapera",
      "piso",
      "limpia piso",
      "vela",
      "bolsa basura",
      "ambientador",
    ],
    pasillo: "9",
    prioridad: 10,
  },
  // --- PRIORIDAD 11: PASILLO 11 ---
  {
    keywords: [
      "mascota",
      "perro",
      "gato",
      "purina",
      "esponja",
      "guante",
      "lavaplatos",
      "desengrasante",
      "limpiavidrios",
    ],
    pasillo: "11",
    prioridad: 11,
  },
  // --- PRIORIDAD 12: PASILLO 12 ---
  {
    keywords: [
      "bebida",
      "tea",
      "agua",
      "jugo",
      "pasabocas",
      "papas",
      "platanito",
      "chitos",
      "servilleta",
      "papel cocina",
      "desechable",
      "vaso",
      "plato",
    ],
    pasillo: "12",
    prioridad: 12,
  },
  // --- PRIORIDAD 13: PASILLO 13 ---
  {
    keywords: [
      "lacteo",
      "yogurt",
      "kumis",
      "queso",
      "mantequilla",
      "cerveza",
      "mani",
      "nuez",
      "golosina",
      "snack",
      "chocolatina",
      "dulce",
      "mexicano",
      "saludable",
      "carne",
      "pollo",
      "pescado",
      "res",
      "cerdo",
      "salchicha",
      "jamon",
      "mortadela",
    ],
    pasillo: "13",
    prioridad: 13,
  },
  // --- PRIORIDAD 14: PASILLO 14 ---
  {
    keywords: [
      "gaseosa",
      "cola",
      "soda",
      "fruta",
      "verdura",
      "tomate",
      "cebolla",
      "papa",
      "zanahoria",
      "limon",
      "aguacate",
      "fruver",
    ],
    pasillo: "14",
    prioridad: 14,
  },
];

/**
 * Determina el pasillo y prioridad de un producto basado en sus categorías Y su nombre
 * @param {Array} categoriasWC - Array de objetos de categorías de WooCommerce
 * @param {String} nombreProducto - (Opcional) El nombre del producto para búsqueda de respaldo
 */
const obtenerInfoPasillo = (categoriasWC, nombreProducto = "") => {
  // 1. Limpieza y Normalización
  const nombreNormalizado = (nombreProducto || "").toLowerCase();

  // 2. Estrategia Principal: Búsqueda por NOMBRE DE CATEGORÍA
  // Esto evita falsos positivos (ej: "Aceite de Bebe" no caerá en "Aceite" de cocina si su categoria es "Bebe")
  if (categoriasWC && categoriasWC.length > 0) {
    const nombresCategorias = categoriasWC
      .map((c) => (c.name || "").toLowerCase())
      .join(" ");

    // Iteramos categorias primero (son las más seguras)
    for (const regla of REGLAS_CATEGORIAS) {
      // Verificamos si alguna clave de categoría está presente en los nombres de categorías del producto
      if (regla.keys.some((key) => nombresCategorias.includes(key))) {
        return { pasillo: regla.pasillo, prioridad: regla.prioridad };
      }
    }
  }

  // 3. Estrategia Fallback: Búsqueda por PALABRAS CLAVE en el NOMBRE
  // Solo se ejecuta si no determinamos nada por categoría.
  for (const regla of REGLAS_KEYWORDS_NOMBRE) {
    if (regla.keywords.some((palabra) => nombreNormalizado.includes(palabra))) {
      return { pasillo: regla.pasillo, prioridad: regla.prioridad };
    }
  }

  // 4. Default
  return { pasillo: "Otros", prioridad: 90 };
};

module.exports = { obtenerInfoPasillo };
