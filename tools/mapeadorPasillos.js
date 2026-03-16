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
 *
 * IMPORTANTE: El ORDEN del array determina la PRIORIDAD de matching.
 * Si un texto coincide con varias reglas, gana la que aparece PRIMERO.
 *
 * Categorías WooCommerce del ecommerce:
 * ──────────────────────────────────────
 * ASEO DEL HOGAR        → P9 (limpieza) / P10 (ropa)
 * BEBIDAS               → P12
 * BELLEZA               → P8
 * CARNES Y PROTEÍNAS    → P13
 * CONGELADOS            → P13
 * CUIDADO DEL BEBÉ      → P7
 * CUIDADO PERSONAL      → P8
 * FRUTAS Y VERDURAS     → P14
 * HELADOS               → P13
 * IMPLEMENTOS DEL HOGAR → P11
 * LICORES Y CIGARRILLOS → P13
 * LÁCTEOS, HUEVOS Y REF → P13 (subcat Huevos → P2)
 * MASCOTAS              → P11
 * MERCADO               → P1-P6 (según subcategoría)
 * SALUDABLE             → P8
 */
const DEFINICION_PASILLOS = [
  // ═══ PRIORIDAD ALTA: categorías específicas que pueden confundirse ═══
  {
    pasillo: "7",
    nombre: "Bebé y Adulto",
    categorias: [
      "bebe", "bebes",
      "pañal", "pañales", "pañitos humedos",
      "cuidado del bebe", "higiene para bebes",
      "adulto", "incontinencia", "pañal adulto",
    ],
  },
  {
    pasillo: "6",
    nombre: "Café y Panadería",
    categorias: [
      "cafe", "cafe molido", "cafe premium", "cafe soluble",
      "chocolate", "chocolates",
      "pan", "tostada",
      "aromaticas",
    ],
  },
  {
    pasillo: "8",
    nombre: "Cuidado Personal y Belleza",
    categorias: [
      "cuidado personal", "cuidado capilar", "cuidado corporal", "cuidado oral",
      "higiene intima", "higiene personal",
      "belleza", "maquillaje", "cosmeticos",
      "proteccion solar", "repelente",
      "salud", "medicamentos", "suplementos", "vitaminas",
      "desodorante", "shampoo", "jabon de baño", "crema dental",
      "saludable", "alimentos saludables",
    ],
  },
  {
    pasillo: "9",
    nombre: "Aseo Hogar",
    categorias: [
      "aseo del hogar", "aseo hogar", "limpieza hogar",
      "ambientador", "ambientadores",
      "gel antibacterial", "antibacterial",
      "limpiadores", "desinfectantes", "limpiadores y desinfectantes",
      "papel higienico", "servilletas", "papel higienico y servilletas",
      "articulos de limpieza", "limpieza",
      "escoba", "escobas", "trapera", "traperas", "trapero",
      "bolsa basura", "vela", "velas",
      "fabuloso", "lavanda",
    ],
  },
  {
    pasillo: "10",
    nombre: "Aseo Ropa",
    categorias: [
      "detergente", "detergentes", "detergente liquido", "detergente en polvo",
      "suavizante", "suavizantes",
      "blanqueador", "blanqueadores", "desmanchadores",
      "jabon barra", "jabones",
    ],
  },

  // ═══ REFRIGERADOS Y CARNES: antes de alimentos secos para capturar subcategorías de LÁCTEOS ═══
  {
    pasillo: "13",
    nombre: "Refrigerados, Carnes y Licores",
    categorias: [
      "refrigerado", "congelado", "congelados", "comidas congeladas",
      "carne", "carnes", "carniceria", "carnes y proteinas",
      "pollo", "cerdo", "res y cerdo",
      "pescado", "pescados", "mariscos", "pescados y mariscos",
      "jamon", "embutido", "embutidos", "carnes frias",
      "queso", "quesos", "cuajada", "cuajadas", "queso crema", "sueros",
      "yogurt", "bebidas lacteas",
      "lacteos",
      "leche",
      "arepa", "arepas",
      "postres", "postres y gelatinas",
      "cerveza", "cervezas",
      "licor", "licores", "vino", "vinos",
      "cigarrillo", "cigarrillos",
      "helado", "helados", "paleta", "paletas",
    ],
  },

  // ═══ BEBIDAS Y DESECHABLES: antes de alimentos secos para capturar "bebidas de cereal" ═══
  {
    pasillo: "12",
    nombre: "Bebidas y Desechables",
    categorias: [
      "gaseosa", "gaseosas", "refrescos",
      "agua",
      "jugo", "jugos", "zumo", "zumos",
      "bebida", "bebidas", "bebidas de cereal",
      "hidratante", "hidratantes", "energizante", "energizantes",
      "desechable", "desechables",
      "vaso", "plato", "lonchera", "loncheras",
      "papel cocina",
    ],
  },

  // ═══ PRIORIDAD MEDIA: Alimentos secos (MERCADO subcategorías) ═══
  {
    pasillo: "2",
    nombre: "Despensa Básica",
    categorias: [
      "huevo", "huevos",
      "atun", "atunes",
      "enlatado", "enlatados", "alimentos enlatados", "conservas",
      "pasta", "pastas", "spaghetti",
      "harina precocida",
    ],
  },
  {
    pasillo: "1",
    nombre: "Granos y Condimentos",
    categorias: [
      "arroz",
      "azucar", "panela", "panelas", "endulzante", "endulzantes",
      "grano", "granos",
      "sal", "salsa", "salsas", "aderezo", "aderezos",
      "vinagre", "vinagreta", "vinagretas",
      "sazonador", "sazonadores", "condimento", "condimentos", "caldos",
    ],
  },
  {
    pasillo: "3",
    nombre: "Aceites y Harinas",
    categorias: [
      "aceite", "aceites", "aceite vegetal", "aceite soya", "aceite oliva",
      "harina", "harinas", "harina de trigo",
      "margarina", "margarinas", "mantequilla",
      "sopa", "sopas",
    ],
  },
  {
    pasillo: "4",
    nombre: "Polvos y Repostería",
    categorias: [
      "gelatina", "flan", "pudin",
      "reposteria", "parva", "reposteria y parva",
      "leche larga vida",
      "refrescos en polvo", "bebidas en polvo",
      "arequipe",
    ],
  },
  {
    pasillo: "5",
    nombre: "Galletas, Dulces y Snacks",
    categorias: [
      "galleta", "galletas", "galleteria", "galleta salada",
      "dulce", "dulces",
      "snack", "snacks", "pasabocas",
      "avena", "avenas",
      "cereal", "cereales", "granola",
      "modificadores",
    ],
  },

  // ═══ OTROS ═══
  {
    pasillo: "11",
    nombre: "Mascotas, Cocina e Implementos",
    categorias: [
      "mascota", "mascotas", "perro", "gato",
      "alimento para mascotas", "alimento para peces", "alimento para aves",
      "arena para gatos",
      "cocina", "utensilios", "utensilios de cocina",
      "esponja", "esponjas", "guante", "guantes",
      "lavaplatos", "desengrasante", "desengrasantes",
      "insecticida", "insecticidas",
      "carbon",
      "implementos del hogar",
    ],
  },
  {
    pasillo: "14",
    nombre: "Fruver",
    categorias: [
      "fruver",
      "fruta", "frutas",
      "verdura", "verduras",
      "frutas y verduras",
      "hortaliza", "hortalizas",
      "tomate", "cebolla", "papa",
    ],
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
    // FILTRO: Ignoramos categorías genéricas o ruidosas que causan conflictos
    let categoriasValidas = categoriasWC.filter((c) => {
      if (!c.name) return false;
      const nombreNormalizado = removeAccents(c.name).toLowerCase().trim();
      // Ignorar "despensa" y la categoría conflictiva dada por el usuario
      if (nombreNormalizado.includes("despensa")) return false;
      if (nombreNormalizado.includes("lacteos, huevos y refrigerados")) return false;
      return true;
    });

    // JERARQUÍA OFICIAL (Nuevo método):
    // Si WooCommerce nos devolvió la estructura de padre-hijo (propiedad parent),
    // nos quedamos EXCLUSIVAMENTE con las categorías hoja (subcategorías, cuyo parent NO es 0).
    const tieneDataDeJerarquia = categoriasValidas.some((c) => c.hasOwnProperty("parent"));

    if (tieneDataDeJerarquia && categoriasValidas.length > 1) {
      const subcategoriasOficiales = categoriasValidas.filter((c) => c.parent > 0);
      if (subcategoriasOficiales.length > 0) {
        categoriasValidas = subcategoriasOficiales;
      }
    }
    // HEURÍSTICA DE SUBCATEGORÍAS (Antiguo método preventivo si falla la API):
    else if (categoriasValidas.length > 1) {
      const subcategorias = categoriasValidas.filter(c => {
        const n = removeAccents(c.name).toLowerCase();
        return !n.includes(",");
      });
      // Si logramos identificar al menos una subcategoría limpia, utilizamos solo esa
      if (subcategorias.length > 0) {
        categoriasValidas = subcategorias;
      }
    }

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
