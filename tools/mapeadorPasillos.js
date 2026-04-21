/**
 * MAPEADOR DE PASILLOS MULTI-SEDE
 *
 * Cada sede tiene su propio layout de pasillos y orden de ruta.
 * Las categorías de WooCommerce son las mismas para todas las sedes,
 * lo que cambia es en QUÉ PASILLO está cada categoría y el ORDEN DE RECORRIDO.
 */

// ============================================================
// CATEGORÍAS COMPARTIDAS (atómicas — cada sede las combina a su manera)
// ============================================================

const CATEGORIAS = {
  bebe_higiene: [
    "bebe",
    "bebes",
    "pañal",
    "pañales",
    "pañitos humedos",
    "pañitos",
    "cuidado del bebe",
    "higiene para bebes",
    "adulto",
    "incontinencia",
    "pañal adulto",
  ],
  cereales_leche_polvo: [
    "cereal",
    "cereales",
    "granola",
    "leche en polvo",
    "bebidas en polvo",
    "milo",
    "chocolisto",
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
    "japonés",
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
    "suavitel",
    "blanqueador",
    "blanqueadores",
    "limpido",
    "desmanchadores",
    "jabon barra",
    "jabones",
    "insecticida",
    "insecticidas",
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
  reposteria_base: ["gelatina", "flan", "pudin", "reposteria"],
  parva_arequipe: ["parva", "reposteria y parva", "arequipe"],
  leche_larga_vida: ["leche larga vida", "leche"],
  gelatinas_refrescos: ["gelatina", "refrescos en polvo", "frutiño", "frutiños"],
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
  licores_cigarrillos: [
    "cerveza",
    "cervezas",
    "licor",
    "licores",
    "vino",
    "vinos",
    "cigarrillo",
    "cigarrillos",
  ],
  dulceria_golosinas: [
    "chocolates y dulces",
    "golosinas de chocolate",
    "golosina",
    "golosinas",
    "dulce",
    "dulces",
    "helado",
    "helados",
    "paleta",
    "paletas",
    "mexicano",
  ],
  mani_bocadillo: ["mani", "nueces", "frutos secos", "bocadillo"],
  lacteos_refrigerados_base: [
    "refrigerado",
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
  ],
  neveras_especial: ["neveras"],
  carnes_frias_congelados: [
    "jamon",
    "embutido",
    "embutidos",
    "carnes frias",
    "congelado",
    "congelados",
    "comidas congeladas",
  ],
  carnes_rojas: [
    "carne",
    "carnes",
    "carniceria",
    "carnes y proteinas",
    "cerdo",
    "res y cerdo",
  ],
  pollo_pescado: [
    "pollo",
    "pescado",
    "pescados",
    "mariscos",
    "pescados y mariscos",
  ],
  saludable_suplementos: [
    "saludable",
    "alimentos saludables",
    "suplementos",
    "vitaminas",
    "suplementos y vitaminas",
  ],
  fruver: [
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
  ],
  gaseosas_mecato: ["gaseosa", "gaseosas", "mecato"],
  salsas_condimentos: [
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
  arroz_granos: [
    "arroz",
    "azucar",
    "panela",
    "panelas",
    "endulzante",
    "endulzantes",
    "grano",
    "granos",
    "sal",
  ],
  huevos: ["huevo", "huevos"],
  atunes_enlatados_pastas: [
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
  bebidas: [
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
  ],
  desechables: [
    "servilletas",
    "desechable",
    "desechables",
    "vaso",
    "plato",
    "lonchera",
    "loncheras",
    "papel cocina",
  ],
  pasabocas_snacks: [
    "snack",
    "snacks",
    "pasabocas",
  ],
};

// ============================================================
// CONFIGURACIÓN POR SEDE
// ============================================================

const SEDES_CONFIG = {
  "copacabana-plaza": {
    orden_ruta: { 2: 1, 1: 2, 3: 3, 4: 4, 6: 5, 5: 6, 7: 7, 8: 8, 10: 9, 9: 10, 11: 11, 12: 12, 13: 13, 14: 14, Otros: 99 },
    pasillos: [
      { pasillo: "7", nombre: "Bebé, Adulto y Cereales", categorias: [...CATEGORIAS.bebe_higiene, ...CATEGORIAS.cereales_leche_polvo] },
      { pasillo: "6", nombre: "Pan de Sal y Café", categorias: CATEGORIAS.cafe_aromaticas },
      { pasillo: "8", nombre: "Cuidado Personal y Belleza", categorias: CATEGORIAS.cuidado_personal },
      { pasillo: "9", nombre: "Aseo Hogar", categorias: CATEGORIAS.aseo_hogar },
      { pasillo: "10", nombre: "Aseo Ropa e Insecticidas", categorias: CATEGORIAS.aseo_ropa },
      {
        pasillo: "13",
        nombre: "Refrigerados, Carnes, Golosinas y Licores",
        categorias: [
          ...CATEGORIAS.licores_cigarrillos, ...CATEGORIAS.dulceria_golosinas, ...CATEGORIAS.mani_bocadillo,
          ...CATEGORIAS.lacteos_refrigerados_base, ...CATEGORIAS.neveras_especial, ...CATEGORIAS.carnes_frias_congelados,
          ...CATEGORIAS.carnes_rojas, ...CATEGORIAS.pollo_pescado, ...CATEGORIAS.saludable_suplementos,
        ],
      },
      { pasillo: "14", nombre: "Gaseosas, Mecato y Fruver", categorias: [...CATEGORIAS.gaseosas_mecato, ...CATEGORIAS.fruver] },
      { pasillo: "12", nombre: "Bebidas, Pasabocas y Desechables", categorias: [...CATEGORIAS.bebidas, ...CATEGORIAS.desechables, ...CATEGORIAS.pasabocas_snacks] },
      { pasillo: "2", nombre: "Huevos, Atunes, Enlatados y Pastas", categorias: [...CATEGORIAS.huevos, ...CATEGORIAS.atunes_enlatados_pastas] },
      { pasillo: "1", nombre: "Arroz, Azúcar, Granos y Salsas", categorias: [...CATEGORIAS.arroz_granos, ...CATEGORIAS.salsas_condimentos] },
      { pasillo: "3", nombre: "Harinas, Margarinas, Sopas y Aceites", categorias: CATEGORIAS.harinas_aceites },
      { pasillo: "4", nombre: "Repostería, Gelatina y Leche Larga Vida", categorias: [...CATEGORIAS.reposteria_base, ...CATEGORIAS.parva_arequipe, ...CATEGORIAS.leche_larga_vida, ...CATEGORIAS.gelatinas_refrescos] },
      { pasillo: "5", nombre: "Pan Dulce, Galletas, Avenas y Leche en Polvo", categorias: CATEGORIAS.galletas_avenas },
      { pasillo: "11", nombre: "Mascotas, Esponjas e Implementos", categorias: CATEGORIAS.mascotas_implementos },
    ],
  },
  girardota: {
    orden_ruta: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11, Otros: 99 },
    pasillos: [
      { pasillo: "1", nombre: "Aseo Hogar y Velas", categorias: CATEGORIAS.aseo_hogar },
      { pasillo: "2", nombre: "Aseo Ropa, Cuidado Personal y Bebé", categorias: [...CATEGORIAS.aseo_ropa, ...CATEGORIAS.cuidado_personal, ...CATEGORIAS.bebe_higiene, ...CATEGORIAS.cereales_leche_polvo] },
      { pasillo: "3", nombre: "Café, Aromáticas y Parva", categorias: CATEGORIAS.cafe_aromaticas },
      { pasillo: "4", nombre: "Leche, Galletas, Granola y Avenas", categorias: [...CATEGORIAS.leche_larga_vida, ...CATEGORIAS.reposteria_base, ...CATEGORIAS.parva_arequipe, ...CATEGORIAS.gelatinas_refrescos, ...CATEGORIAS.galletas_avenas] },
      { pasillo: "5", nombre: "Licores y Dulcería", categorias: [...CATEGORIAS.licores_cigarrillos, ...CATEGORIAS.dulceria_golosinas] },
      { pasillo: "6", nombre: "Mecato, Gaseosas y Refrescos", categorias: [...CATEGORIAS.gaseosas_mecato, ...CATEGORIAS.desechables, ...CATEGORIAS.pasabocas_snacks] },
      { pasillo: "7", nombre: "Salsas, Atún, Enlatados, Pastas y Condimentos", categorias: [...CATEGORIAS.salsas_condimentos, ...CATEGORIAS.atunes_enlatados_pastas, ...CATEGORIAS.mani_bocadillo] },
      { pasillo: "8", nombre: "Arroz, Aceites, Huevos, Granos, Panela y Harinas", categorias: [...CATEGORIAS.arroz_granos, ...CATEGORIAS.harinas_aceites, ...CATEGORIAS.huevos] },
      {
        pasillo: "9",
        nombre: "Mascotas, Bebidas, Lácteos y Refrigerados",
        categorias: [
          ...CATEGORIAS.mascotas_implementos, ...CATEGORIAS.bebidas, ...CATEGORIAS.lacteos_refrigerados_base,
          ...CATEGORIAS.neveras_especial, ...CATEGORIAS.carnes_frias_congelados, ...CATEGORIAS.pollo_pescado,
          ...CATEGORIAS.saludable_suplementos,
        ],
      },
      { pasillo: "10", nombre: "Frutas y Verduras", categorias: CATEGORIAS.fruver },
      { pasillo: "11", nombre: "Carnes", categorias: CATEGORIAS.carnes_rojas },
    ],
  },
  barbosa: {
    orden_ruta: { 1: 1, 2: 2, 3: 3, 5: 4, 6: 5, 7: 6, 8: 7, Otros: 99 },
    pasillos: [
      { pasillo: "1", nombre: "Granos, Salsas, Aceites, Pastas y Enlatados", categorias: [...CATEGORIAS.arroz_granos, ...CATEGORIAS.salsas_condimentos, ...CATEGORIAS.harinas_aceites, ...CATEGORIAS.atunes_enlatados_pastas] },
      { pasillo: "2", nombre: "Fruver", categorias: CATEGORIAS.fruver },
      { pasillo: "3", nombre: "Carnes", categorias: [...CATEGORIAS.carnes_rojas, ...CATEGORIAS.pollo_pescado] },
      { pasillo: "5", nombre: "Mekato, Dulcería, Cereales y Pan de Sal", categorias: [...CATEGORIAS.gaseosas_mecato, ...CATEGORIAS.dulceria_golosinas, ...CATEGORIAS.parva_arequipe, ...CATEGORIAS.leche_larga_vida, ...CATEGORIAS.cereales_leche_polvo, ...CATEGORIAS.galletas_avenas, ...CATEGORIAS.cafe_aromaticas] },
      { pasillo: "6", nombre: "Refrigerados, Bebidas y Desechables", categorias: [...CATEGORIAS.carnes_frias_congelados, ...CATEGORIAS.lacteos_refrigerados_base, ...CATEGORIAS.bebidas, ...CATEGORIAS.desechables, ...CATEGORIAS.pasabocas_snacks, ...CATEGORIAS.mascotas_implementos] },
      { pasillo: "7", nombre: "Aseo y Mascotas", categorias: [...CATEGORIAS.aseo_hogar, ...CATEGORIAS.aseo_ropa, ...CATEGORIAS.mascotas_implementos, ...CATEGORIAS.cuidado_personal] },
      { pasillo: "8", nombre: "Licores y Gaseosas", categorias: [...CATEGORIAS.licores_cigarrillos, ...CATEGORIAS.bebidas] },
    ],
  },
  villahermosa: {
    orden_ruta: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11, Otros: 99 },
    pasillos: [
      { pasillo: "1", nombre: "Granos, Aceites, Harinas y Huevos", categorias: [...CATEGORIAS.arroz_granos, ...CATEGORIAS.harinas_aceites, ...CATEGORIAS.reposteria_base, ...CATEGORIAS.huevos] },
      { pasillo: "2", nombre: "Salsas, Enlatados, Pastas y Atún", categorias: [...CATEGORIAS.salsas_condimentos, ...CATEGORIAS.atunes_enlatados_pastas] },
      { pasillo: "3", nombre: "Cereales y Leche", categorias: [...CATEGORIAS.cereales_leche_polvo, ...CATEGORIAS.leche_larga_vida, ...CATEGORIAS.galletas_avenas] },
      { pasillo: "4", nombre: "Café, Aromáticas, Parva y Galletas", categorias: [...CATEGORIAS.cafe_aromaticas, ...CATEGORIAS.parva_arequipe, ...CATEGORIAS.galletas_avenas] },
      { pasillo: "5", nombre: "Aseo y Cuidado del Bebé", categorias: [...CATEGORIAS.aseo_hogar, ...CATEGORIAS.aseo_ropa, ...CATEGORIAS.bebe_higiene] },
      { pasillo: "6", nombre: "Cuidado Personal", categorias: [...CATEGORIAS.cuidado_personal, ...CATEGORIAS.saludable_suplementos] },
      { pasillo: "7", nombre: "Carnicería y Carnes Frías", categorias: [...CATEGORIAS.carnes_frias_congelados, ...CATEGORIAS.carnes_rojas, ...CATEGORIAS.pollo_pescado] },
      { pasillo: "8", nombre: "Lácteos, Congelados y Desechables", categorias: [...CATEGORIAS.lacteos_refrigerados_base, ...CATEGORIAS.carnes_frias_congelados, ...CATEGORIAS.desechables] },
      { pasillo: "9", nombre: "Mekato, Golosinas y Pasabocas", categorias: [...CATEGORIAS.gelatinas_refrescos, ...CATEGORIAS.bebidas, ...CATEGORIAS.gaseosas_mecato, ...CATEGORIAS.pasabocas_snacks, ...CATEGORIAS.dulceria_golosinas] },
      { pasillo: "10", nombre: "Mascotas y Aseo Hogar", categorias: [...CATEGORIAS.mascotas_implementos, ...CATEGORIAS.aseo_hogar] },
      { pasillo: "11", nombre: "Fruver, Licores y Neveras", categorias: [...CATEGORIAS.fruver, ...CATEGORIAS.licores_cigarrillos, ...CATEGORIAS.neveras_especial] },
    ],
  },
};

const SEDE_DEFAULT = "copacabana-plaza";

const removeAccents = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const matchesKey = (text, key) => {
  const normalizedText = removeAccents(text).toLowerCase();
  const normalizedKey = removeAccents(key).toLowerCase();
  if (normalizedKey.includes(" ")) return normalizedText.includes(normalizedKey);
  try {
    const regex = new RegExp(`\\b${normalizedKey}(s|es)?\\b`, "i");
    return regex.test(normalizedText);
  } catch (e) {
    return normalizedText.includes(normalizedKey);
  }
};

const buildReglas = (sedeSlug) => {
  const config = SEDES_CONFIG[sedeSlug] || SEDES_CONFIG[SEDE_DEFAULT];
  return config.pasillos.map((def) => ({
    keys: def.categorias,
    pasillo: def.pasillo,
    nombre: def.nombre,
    prioridad: config.orden_ruta[def.pasillo] || config.orden_ruta["Otros"] || 99,
  }));
};

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

const findAllMatches = (text, reglas) => {
  const matches = new Map();
  for (const regla of reglas) {
    for (const key of regla.keys) {
      if (matchesKey(text, key)) {
        const current = matches.get(regla) || 0;
        if (key.length > current) matches.set(regla, key.length);
      }
    }
  }
  return matches;
};

const obtenerInfoPasillo = (categoriasWC, nombreProducto = "", sedeSlug = "") => {
  const config = SEDES_CONFIG[sedeSlug] || SEDES_CONFIG[SEDE_DEFAULT];
  const reglas = buildReglas(sedeSlug);
  const ordenRuta = config.orden_ruta;
  if (categoriasWC && categoriasWC.length > 0) {
    let categoriasValidas = categoriasWC.filter((c) => {
      if (!c.name) return false;
      const nombreNormalizado = removeAccents(c.name).toLowerCase().trim();
      if (nombreNormalizado.includes("despensa")) return false;
      if (nombreNormalizado.includes("lacteos, huevos y refrigerados")) return false;
      return true;
    });
    const tieneDataDeJerarquia = categoriasValidas.some((c) => c.hasOwnProperty("parent"));
    if (tieneDataDeJerarquia && categoriasValidas.length > 1) {
      const subcategoriasOficiales = categoriasValidas.filter((c) => c.parent > 0);
      if (subcategoriasOficiales.length > 0) categoriasValidas = subcategoriasOficiales;
    } else if (categoriasValidas.length > 1) {
      const subcategorias = categoriasValidas.filter((c) => !removeAccents(c.name).toLowerCase().includes(","));
      if (subcategorias.length > 0) categoriasValidas = subcategorias;
    }
    const nombresCategorias = categoriasValidas.map((c) => c.name || "").join(" ");
    const allMatches = findAllMatches(nombresCategorias, reglas);
    if (allMatches.size === 1) {
      const [match] = allMatches.keys();
      return { pasillo: match.pasillo, prioridad: match.prioridad };
    }
    if (allMatches.size > 1) {
      if (nombreProducto) {
        const candidatos = [...allMatches.keys()];
        const productMatch = findBestMatch(nombreProducto, candidatos);
        if (productMatch) return { pasillo: productMatch.pasillo, prioridad: productMatch.prioridad };
      }
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
  const match = findBestMatch(nombreProducto || "", reglas);
  if (match) return { pasillo: match.pasillo, prioridad: match.prioridad };
  return { pasillo: "Otros", prioridad: ordenRuta["Otros"] || 99 };
};

module.exports = { obtenerInfoPasillo, SEDES_CONFIG, SEDE_DEFAULT, CATEGORIAS };
