/**
 * MAPA DE PASILLOS Y PRIORIDADES LOGÍSTICAS
 * La prioridad define el orden en que aparecerán los productos a la recolectora.
 * Orden de ruta: 2 -> 1 -> 3 -> 4 -> 6 -> 5 -> 7 -> 8 -> 10 -> 9 -> 11 -> 12 -> 13 -> 14
 */

const MAPA_PASILLOS = {
  // --- PRIORIDAD 1: PASILLO 2 ---
  "huevos": { pasillo: "2", prioridad: 1 },
  "atunes": { pasillo: "2", prioridad: 1 },
  "enlatados": { pasillo: "2", prioridad: 1 },
  "pastas": { pasillo: "2", prioridad: 1 },

  // --- PRIORIDAD 2: PASILLO 1 ---
  "arroz": { pasillo: "1", prioridad: 2 },
  "azucar": { pasillo: "1", prioridad: 2 },
  "grano": { pasillo: "1", prioridad: 2 },
  "vinagretas": { pasillo: "1", prioridad: 2 },
  "salsas": { pasillo: "1", prioridad: 2 },
  "sazonador": { pasillo: "1", prioridad: 2 },

  // --- PRIORIDAD 3: PASILLO 3 ---
  "harinas": { pasillo: "3", prioridad: 3 },
  "margarinas": { pasillo: "3", prioridad: 3 },
  "sopas": { pasillo: "3", prioridad: 3 },
  "aceite vegetal": { pasillo: "3", prioridad: 3 },
  "aceite soya": { pasillo: "3", prioridad: 3 },
  "aceite oliva": { pasillo: "3", prioridad: 3 },

  // --- PRIORIDAD 4: PASILLO 4 ---
  "refrescos en polvo": { pasillo: "4", prioridad: 4 },
  "gelatina": { pasillo: "4", prioridad: 4 },
  "reposteria": { pasillo: "4", prioridad: 4 },
  "arequipe": { pasillo: "4", prioridad: 4 },
  "leche larga vida": { pasillo: "4", prioridad: 4 },

  // --- PRIORIDAD 5: PASILLO 6 --- (Orden según tu lista: 4 luego 6)
  "pan de sal": { pasillo: "6", prioridad: 5 },
  "chocolate": { pasillo: "6", prioridad: 5 },
  "cafe molido": { pasillo: "6", prioridad: 5 },
  "cafe premium": { pasillo: "6", prioridad: 5 },
  "cafe soluble": { pasillo: "6", prioridad: 5 },

  // --- PRIORIDAD 6: PASILLO 5 --- (Orden según tu lista: 6 luego 5)
  "pan dulce": { pasillo: "5", prioridad: 6 },
  "avenas": { pasillo: "5", prioridad: 6 },
  "galleta salada": { pasillo: "5", prioridad: 6 },
  "galleta dulce": { pasillo: "5", prioridad: 6 },
  "galleta saludable": { pasillo: "5", prioridad: 6 },

  // --- PRIORIDAD 7: PASILLO 7 ---
  "parte adulto": { pasillo: "7", prioridad: 7 },
  "pañitos humedos": { pasillo: "7", prioridad: 7 },
  "pañales": { pasillo: "7", prioridad: 7 },
  "cereales": { pasillo: "7", prioridad: 7 },
  "leche en polvo": { pasillo: "7", prioridad: 7 },
  "granola": { pasillo: "7", prioridad: 7 },

  // --- PRIORIDAD 8: PASILLO 8 ---
  "parte femenina": { pasillo: "8", prioridad: 8 },
  "cremas dentales": { pasillo: "8", prioridad: 8 },
  "cremas corporales": { pasillo: "8", prioridad: 8 },
  "jabon de baño": { pasillo: "8", prioridad: 8 },
  "higiene capilar": { pasillo: "8", prioridad: 8 },
  "desodorantes": { pasillo: "8", prioridad: 8 },

  // --- PRIORIDAD 9: PASILLO 10 --- (Orden según tu lista: 8 luego 10)
  "jabon barra": { pasillo: "10", prioridad: 9 },
  "detergente liquido": { pasillo: "10", prioridad: 9 },
  "detergente en polvo": { pasillo: "10", prioridad: 9 },
  "insecticidas": { pasillo: "10", prioridad: 9 },
  "blanqueadores": { pasillo: "10", prioridad: 9 },
  "suavizantes": { pasillo: "10", prioridad: 9 },

  // --- PRIORIDAD 10: PASILLO 9 --- (Orden según tu lista: 10 luego 9)
  "escobas": { pasillo: "9", prioridad: 10 },
  "papel higienico": { pasillo: "9", prioridad: 10 },
  "traperas": { pasillo: "9", prioridad: 10 },
  "limpia piso": { pasillo: "9", prioridad: 10 },
  "velas": { pasillo: "9", prioridad: 10 },

  // --- PRIORIDAD 11: PASILLO 11 ---
  "mascotas": { pasillo: "11", prioridad: 11 },
  "esponjas": { pasillo: "11", prioridad: 11 },
  "guantes": { pasillo: "11", prioridad: 11 },
  "lavaplatos": { pasillo: "11", prioridad: 11 },
  "desengrasante": { pasillo: "11", prioridad: 11 },

  // --- PRIORIDAD 12: PASILLO 12 ---
  "bebidas": { pasillo: "12", prioridad: 12 },
  "pasabocas": { pasillo: "12", prioridad: 12 },
  "servilletas": { pasillo: "12", prioridad: 12 },
  "papel cocina": { pasillo: "12", prioridad: 12 },
  "desechables": { pasillo: "12", prioridad: 12 },

  // --- PRIORIDAD 13: PASILLO 13 ---
  "nevera de lacteos derivados": { pasillo: "13", prioridad: 13 },
  "cervezas": { pasillo: "13", prioridad: 13 },
  "mani": { pasillo: "13", prioridad: 13 },
  "golosinas": { pasillo: "13", prioridad: 13 },
  "golosinas de chocolate": { pasillo: "13", prioridad: 13 },
  "nueces": { pasillo: "13", prioridad: 13 },
  "mexicano": { pasillo: "13", prioridad: 13 },
  "saludable": { pasillo: "13", prioridad: 13 },
  "nevera de carnes frias": { pasillo: "13", prioridad: 13 },
  "carniceria": { pasillo: "13", prioridad: 13 },

  // --- PRIORIDAD 14: PASILLO 14 ---
  "nevera de gaseosas": { pasillo: "14", prioridad: 14 },
  "fruver": { pasillo: "14", prioridad: 14 }
};

/**
 * Determina el pasillo y prioridad de un producto basado en sus categorías de WooCommerce
 */
const obtenerInfoPasillo = (categoriasWC) => {
  // Si no hay categorías, va al final (S/N)
  if (!categoriasWC || categoriasWC.length === 0) {
    return { pasillo: "S/N", prioridad: 99 };
  }

  // Buscamos coincidencia en el mapa recorriendo las categorías del producto
  for (const cat of categoriasWC) {
    const nombreCat = cat.name.toLowerCase().trim();
    if (MAPA_PASILLOS[nombreCat]) {
      return MAPA_PASILLOS[nombreCat];
    }
  }

  // Si tiene categorías pero ninguna coincide con nuestro mapa de pasillos
  return { pasillo: "Otros", prioridad: 90 };
};

module.exports = { obtenerInfoPasillo };