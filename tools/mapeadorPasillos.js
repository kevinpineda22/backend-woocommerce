/**
 * MAPEADOR DE PASILLOS MULTI-SEDE
 *
 * Cada sede tiene su propio layout de pasillos y orden de ruta.
 * Las categorías de WooCommerce son las mismas para todas las sedes,
 * lo que cambia es en QUÉ PASILLO está cada categoría y el ORDEN DE RECORRIDO.
 *
 * Para agregar una nueva sede:
 *   1. Crear una entrada en SEDES_CONFIG con el slug de la sede
 *   2. Definir ORDEN_RUTA (serpentina del picker)
 *   3. Definir DEFINICION_PASILLOS (categorías → pasillo)
 *   4. Listo. El sistema lo detecta automáticamente.
 */

// ============================================================
// CATEGORÍAS COMPARTIDAS (iguales en todas las sedes)
// ============================================================

const CATEGORIAS = {
  bebe_adulto_cereales: [
    "bebe",
    "bebes",
    "pañal",
    "pañales",
    "pañitos humedos",
    "cuidado del bebe",
    "higiene para bebes",
    "adulto",
    "incontinencia",
    "pañal adulto",
    "cereal",
    "cereales",
    "granola",
    "leche en polvo",
    "bebidas en polvo",
  ],
  cafe_aromaticas: [
    "cafe",
    "cafe molido",
    "cafe premium",
    "cafe soluble",
    "aromaticas",
    "aromaticas, te y cafe",
    "pan de sal",
    "tostada",
    "chocolate",
    "chocolates",
    "chocolate de mesa",
  ],
  cuidado_personal: [
    "cuidado personal",
    "cuidado capilar",
    "cuidado corporal",
    "cuidado oral",
    "higiene intima",
    "higiene personal",
    "belleza",
    "maquillaje",
    "cosmeticos",
    "proteccion solar",
    "repelente",
    "desodorante",
    "shampoo",
    "jabon de baño",
    "crema dental",
    "crema corporal",
    "cremas corporales",
    "salud",
    "medicamentos",
    "salud y medicamentos",
  ],
  aseo_hogar: [
    "aseo del hogar",
    "aseo hogar",
    "limpieza hogar",
    "ambientador",
    "ambientadores",
    "gel antibacterial",
    "antibacterial",
    "limpiadores",
    "desinfectantes",
    "limpiadores y desinfectantes",
    "papel higienico",
    "papel higienico y servilletas",
    "articulos de limpieza",
    "limpieza",
    "escoba",
    "escobas",
    "trapera",
    "traperas",
    "trapero",
    "limpia piso",
    "limpiapiso",
    "bolsa basura",
    "vela",
    "velas",
    "fabuloso",
    "lavanda",
  ],
  aseo_ropa: [
    "detergente",
    "detergentes",
    "detergente liquido",
    "detergente en polvo",
    "suavizante",
    "suavizantes",
    "blanqueador",
    "blanqueadores",
    "desmanchadores",
    "jabon barra",
    "jabones",
    "insecticida",
    "insecticidas",
  ],
  refrigerados_carnes_licores: [
    "refrigerado",
    "congelado",
    "congelados",
    "comidas congeladas",
    "carne",
    "carnes",
    "carniceria",
    "carnes y proteinas",
    "pollo",
    "cerdo",
    "res y cerdo",
    "pescado",
    "pescados",
    "mariscos",
    "pescados y mariscos",
    "jamon",
    "embutido",
    "embutidos",
    "carnes frias",
    "queso",
    "quesos",
    "cuajada",
    "cuajadas",
    "queso crema",
    "sueros",
    "yogurt",
    "bebidas lacteas",
    "lacteos",
    "arepa",
    "arepas",
    "postres",
    "postres y gelatinas",
    "cerveza",
    "cervezas",
    "licor",
    "licores",
    "vino",
    "vinos",
    "cigarrillo",
    "cigarrillos",
    "helado",
    "helados",
    "paleta",
    "paletas",
    "chocolates y dulces",
    "golosinas de chocolate",
    "golosina",
    "golosinas",
    "dulce",
    "dulces",
    "mani",
    "nueces",
    "frutos secos",
    "mexicano",
    "saludable",
    "alimentos saludables",
    "suplementos",
    "vitaminas",
    "suplementos y vitaminas",
  ],
  gaseosas_mecato_fruver: [
    "fruver",
    "fruta",
    "frutas",
    "verdura",
    "verduras",
    "frutas y verduras",
    "hortaliza",
    "hortalizas",
    "tomate",
    "cebolla",
    "papa",
    "gaseosa",
    "gaseosas",
    "mecato",
  ],
  bebidas_pasabocas: [
    "jugo",
    "jugos",
    "zumo",
    "zumos",
    "bebida",
    "bebidas",
    "bebidas de cereal",
    "agua",
    "hidratante",
    "hidratantes",
    "energizante",
    "energizantes",
    "snack",
    "snacks",
    "pasabocas",
    "servilletas",
    "desechable",
    "desechables",
    "vaso",
    "plato",
    "lonchera",
    "loncheras",
    "papel cocina",
  ],
  huevos_atunes_pastas: [
    "huevo",
    "huevos",
    "atun",
    "atunes",
    "enlatado",
    "enlatados",
    "alimentos enlatados",
    "conservas",
    "pasta",
    "pastas",
    "spaghetti",
  ],
  arroz_azucar_granos: [
    "arroz",
    "azucar",
    "panela",
    "panelas",
    "endulzante",
    "endulzantes",
    "grano",
    "granos",
    "sal",
    "salsa",
    "salsas",
    "aderezo",
    "aderezos",
    "vinagre",
    "vinagreta",
    "vinagretas",
    "sazonador",
    "sazonadores",
    "condimento",
    "condimentos",
    "caldos",
  ],
  harinas_aceites: [
    "aceite",
    "aceites",
    "aceite vegetal",
    "aceite soya",
    "aceite oliva",
    "harina",
    "harinas",
    "harina de trigo",
    "harina precocida",
    "margarina",
    "margarinas",
    "mantequilla",
    "sopa",
    "sopas",
  ],
  reposteria_leche: [
    "gelatina",
    "flan",
    "pudin",
    "reposteria",
    "parva",
    "reposteria y parva",
    "leche larga vida",
    "leche",
    "refrescos en polvo",
    "arequipe",
  ],
  galletas_avenas: [
    "galleta",
    "galletas",
    "galleteria",
    "galleta salada",
    "galleta dulce",
    "galleta saludable",
    "pan dulce",
    "avena",
    "avenas",
    "modificadores",
  ],
  mascotas_implementos: [
    "mascota",
    "mascotas",
    "perro",
    "gato",
    "alimento para mascotas",
    "alimento para peces",
    "alimento para aves",
    "arena para gatos",
    "cocina",
    "utensilios",
    "utensilios de cocina",
    "esponja",
    "esponjas",
    "guante",
    "guantes",
    "lavaplatos",
    "desengrasante",
    "desengrasantes",
    "carbon",
    "implementos del hogar",
  ],
};

// ============================================================
// CONFIGURACIÓN POR SEDE
// ============================================================

const SEDES_CONFIG = {
  /**
   * COPACABANA PLAZA
   * Layout: 14 pasillos (P1-P14)
   * Recorrido serpentina: P2 → P1 → P3 → P4 → P6 → P5 → P7 → P8 → P10 → P9 → P11 → P12 → P13 → P14
   */
  "copacabana-plaza": {
    orden_ruta: {
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
      Otros: 99,
    },
    pasillos: [
      {
        pasillo: "7",
        nombre: "Bebé, Adulto y Cereales",
        categorias: CATEGORIAS.bebe_adulto_cereales,
      },
      {
        pasillo: "6",
        nombre: "Pan de Sal y Café",
        categorias: CATEGORIAS.cafe_aromaticas,
      },
      {
        pasillo: "8",
        nombre: "Cuidado Personal y Belleza",
        categorias: CATEGORIAS.cuidado_personal,
      },
      { pasillo: "9", nombre: "Aseo Hogar", categorias: CATEGORIAS.aseo_hogar },
      {
        pasillo: "10",
        nombre: "Aseo Ropa e Insecticidas",
        categorias: CATEGORIAS.aseo_ropa,
      },
      {
        pasillo: "13",
        nombre: "Refrigerados, Carnes, Golosinas y Licores",
        categorias: CATEGORIAS.refrigerados_carnes_licores,
      },
      {
        pasillo: "14",
        nombre: "Gaseosas, Mecato y Fruver",
        categorias: CATEGORIAS.gaseosas_mecato_fruver,
      },
      {
        pasillo: "12",
        nombre: "Bebidas, Pasabocas y Desechables",
        categorias: CATEGORIAS.bebidas_pasabocas,
      },
      {
        pasillo: "2",
        nombre: "Huevos, Atunes, Enlatados y Pastas",
        categorias: CATEGORIAS.huevos_atunes_pastas,
      },
      {
        pasillo: "1",
        nombre: "Arroz, Azúcar, Granos y Salsas",
        categorias: CATEGORIAS.arroz_azucar_granos,
      },
      {
        pasillo: "3",
        nombre: "Harinas, Margarinas, Sopas y Aceites",
        categorias: CATEGORIAS.harinas_aceites,
      },
      {
        pasillo: "4",
        nombre: "Repostería, Gelatina y Leche Larga Vida",
        categorias: CATEGORIAS.reposteria_leche,
      },
      {
        pasillo: "5",
        nombre: "Pan Dulce, Galletas, Avenas y Leche en Polvo",
        categorias: CATEGORIAS.galletas_avenas,
      },
      {
        pasillo: "11",
        nombre: "Mascotas, Esponjas e Implementos",
        categorias: CATEGORIAS.mascotas_implementos,
      },
    ],
  },

  /**
   * GIRARDOTA
   * ⚠️ TODO: Completar cuando se tenga el mapeo físico del supermercado.
   *
   * Pasos:
   *   1. Anotar cuántos pasillos hay y qué categorías tiene cada uno
   *   2. Definir el orden de recorrido (serpentina)
   *   3. Llenar esta configuración
   *
   * Mientras tanto, usa el layout de Copacabana como fallback.
   */
  // "girardota": {
  //   orden_ruta: {
  //     1: 1, 2: 2, 3: 3, ...  // TODO: definir serpentina
  //     Otros: 99,
  //   },
  //   pasillos: [
  //     { pasillo: "1", nombre: "TODO", categorias: CATEGORIAS.arroz_azucar_granos },
  //     { pasillo: "2", nombre: "TODO", categorias: CATEGORIAS.huevos_atunes_pastas },
  //     // ... agregar todos los pasillos
  //   ],
  // },
};

// Sede por defecto si no se encuentra la sede solicitada
const SEDE_DEFAULT = "copacabana-plaza";

// ============================================================
// MOTOR DE MATCHING (igual para todas las sedes)
// ============================================================

const removeAccents = (str) =>
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const matchesKey = (text, key) => {
  const normalizedText = removeAccents(text).toLowerCase();
  const normalizedKey = removeAccents(key).toLowerCase();

  if (normalizedKey.includes(" ")) {
    return normalizedText.includes(normalizedKey);
  }

  try {
    const regex = new RegExp(`\\b${normalizedKey}(s|es)?\\b`, "i");
    return regex.test(normalizedText);
  } catch (e) {
    return normalizedText.includes(normalizedKey);
  }
};

/**
 * Genera las reglas de pasillos para una sede específica.
 */
const buildReglas = (sedeSlug) => {
  const config = SEDES_CONFIG[sedeSlug] || SEDES_CONFIG[SEDE_DEFAULT];
  return config.pasillos.map((def) => ({
    keys: def.categorias,
    pasillo: def.pasillo,
    nombre: def.nombre,
    prioridad:
      config.orden_ruta[def.pasillo] || config.orden_ruta["Otros"] || 99,
  }));
};

/**
 * Busca la regla con la coincidencia MÁS ESPECÍFICA (key más larga).
 */
const findBestMatch = (text, reglas) => {
  let bestMatch = null;
  let bestKeyLength = 0;

  for (const regla of reglas) {
    for (const key of regla.keys) {
      if (matchesKey(text, key) && key.length > bestKeyLength) {
        bestKeyLength = key.length;
        bestMatch = regla;
      }
    }
  }

  return bestMatch;
};

/**
 * Busca TODAS las reglas que matchean en el texto.
 * Retorna un Map<regla, mejorKeyLength> para detectar ambigüedades
 * (ej: categoría "Pastas y Harinas" matchea pasillo 2 Y pasillo 3).
 */
const findAllMatches = (text, reglas) => {
  const matches = new Map();

  for (const regla of reglas) {
    for (const key of regla.keys) {
      if (matchesKey(text, key)) {
        const current = matches.get(regla) || 0;
        if (key.length > current) {
          matches.set(regla, key.length);
        }
      }
    }
  }

  return matches;
};

/**
 * Determina el pasillo y prioridad de un producto basado en sus categorías.
 *
 * @param {Array} categoriasWC - Categorías de WooCommerce [{name: "..."}]
 * @param {String} nombreProducto - Nombre del producto (fallback)
 * @param {String} sedeSlug - Slug de la sede (ej: "copacabana-plaza", "girardota")
 */
const obtenerInfoPasillo = (
  categoriasWC,
  nombreProducto = "",
  sedeSlug = "",
) => {
  const config = SEDES_CONFIG[sedeSlug] || SEDES_CONFIG[SEDE_DEFAULT];
  const reglas = buildReglas(sedeSlug);
  const ordenRuta = config.orden_ruta;

  // 1. Estrategia Principal: Búsqueda por NOMBRE DE CATEGORÍA
  if (categoriasWC && categoriasWC.length > 0) {
    let categoriasValidas = categoriasWC.filter((c) => {
      if (!c.name) return false;
      const nombreNormalizado = removeAccents(c.name).toLowerCase().trim();
      if (nombreNormalizado.includes("despensa")) return false;
      if (nombreNormalizado.includes("lacteos, huevos y refrigerados"))
        return false;
      return true;
    });

    const tieneDataDeJerarquia = categoriasValidas.some((c) =>
      c.hasOwnProperty("parent"),
    );

    if (tieneDataDeJerarquia && categoriasValidas.length > 1) {
      const subcategoriasOficiales = categoriasValidas.filter(
        (c) => c.parent > 0,
      );
      if (subcategoriasOficiales.length > 0) {
        categoriasValidas = subcategoriasOficiales;
      }
    } else if (categoriasValidas.length > 1) {
      const subcategorias = categoriasValidas.filter((c) => {
        const n = removeAccents(c.name).toLowerCase();
        return !n.includes(",");
      });
      if (subcategorias.length > 0) {
        categoriasValidas = subcategorias;
      }
    }

    const nombresCategorias = categoriasValidas
      .map((c) => c.name || "")
      .join(" ");

    // Detectar si la categoría matchea múltiples pasillos (ambigüedad)
    const allMatches = findAllMatches(nombresCategorias, reglas);

    if (allMatches.size === 1) {
      // Match único — sin ambigüedad
      const [match] = allMatches.keys();
      return { pasillo: match.pasillo, prioridad: match.prioridad };
    }

    if (allMatches.size > 1) {
      // Ambiguo (ej: categoría "Pastas y Harinas" matchea P2 y P3)
      // Desempatar con el nombre del producto
      if (nombreProducto) {
        const candidatos = [...allMatches.keys()];
        const productMatch = findBestMatch(nombreProducto, candidatos);
        if (productMatch) {
          return {
            pasillo: productMatch.pasillo,
            prioridad: productMatch.prioridad,
          };
        }
      }
      // Sin nombre o nombre no desempata → usar la key más larga de categoría
      let bestMatch = null;
      let bestLen = 0;
      for (const [regla, len] of allMatches) {
        if (len > bestLen) {
          bestLen = len;
          bestMatch = regla;
        }
      }
      return { pasillo: bestMatch.pasillo, prioridad: bestMatch.prioridad };
    }
  }

  // 2. Estrategia Fallback: Búsqueda por NOMBRE DEL PRODUCTO
  const match = findBestMatch(nombreProducto || "", reglas);
  if (match) {
    return { pasillo: match.pasillo, prioridad: match.prioridad };
  }

  // 3. Default
  return { pasillo: "Otros", prioridad: ordenRuta["Otros"] || 99 };
};

module.exports = {
  obtenerInfoPasillo,
  SEDES_CONFIG,
  SEDE_DEFAULT,
  CATEGORIAS,
};
