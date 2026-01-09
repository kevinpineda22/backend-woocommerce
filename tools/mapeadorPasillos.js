/**
 * MAPA DE PASILLOS Y PRIORIDADES LOGÍSTICAS (CORREGIDO - POR PALABRAS CLAVE)
 * * La prioridad define el orden en que aparecerán los productos a la recolectora.
 * Orden de ruta: 2 -> 1 -> 3 -> 4 -> 6 -> 5 -> 7 -> 8 -> 10 -> 9 -> 11 -> 12 -> 13 -> 14
 * * NOTA: Este sistema busca coincidencias parciales.
 * Ejemplo: Si la palabra clave es "aceite", detectará "Aceite Diana", "Aceites", "Aceite de Oliva".
 */

const REGLAS_PASILLOS = [
  // --- PRIORIDAD 1: PASILLO 2 ---
  // Huevos, atunes, enlatados, pastas
  { 
    keywords: ["huevo", "atun", "enlatado", "pasta", "spaghetti", "macarron", "fideo"], 
    pasillo: "2", 
    prioridad: 1 
  },

  // --- PRIORIDAD 2: PASILLO 1 ---
  // Arroz, azucar, grano, vinagretas, salsas, sazonador
  { 
    keywords: ["arroz", "azucar", "grano", "lenteja", "frijol", "blanquillo", "garbanzo", "vinagreta", "salsa", "sazonador", "aderezo", "mayonesa", "mostaza"], 
    pasillo: "1", 
    prioridad: 2 
  },

  // --- PRIORIDAD 3: PASILLO 3 ---
  // Harinas, margarinas, sopas, aceites
  { 
    keywords: ["harina", "margarina", "mantequilla", "sopa", "crema", "aceite", "manteca", "soya", "oliva", "girasol"], 
    pasillo: "3", 
    prioridad: 3 
  },

  // --- PRIORIDAD 4: PASILLO 4 ---
  // Refrescos, gelatina, reposteria, arequipe, leche larga vida
  { 
    keywords: ["refresco", "polvo", "gelatina", "reposteria", "arequipe", "leche larga vida", "leche uht", "leche entera", "leche deslactosada"], 
    pasillo: "4", 
    prioridad: 4 
  },

  // --- PRIORIDAD 5: PASILLO 6 --- (OJO: En tu ruta el 6 va antes del 5)
  // Pan de sal, chocolate, cafe
  { 
    keywords: ["pan", "tostada", "calado", "chocolate", "cafe", "cocoa"], 
    pasillo: "6", 
    prioridad: 5 
  },

  // --- PRIORIDAD 6: PASILLO 5 ---
  // Pan dulce, avenas, galletas
  { 
    keywords: ["galleta", "avena", "saltin", "wafer", "dulce", "ponque", "brownie"], 
    pasillo: "5", 
    prioridad: 6 
  },

  // --- PRIORIDAD 7: PASILLO 7 ---
  // Adulto, pañitos, pañales, cereales, leche polvo
  { 
    keywords: ["pañal", "bebe", "humedos", "toallita", "cereal", "leche en polvo", "granola", "adulto", "incontinencia"], 
    pasillo: "7", 
    prioridad: 7 
  },

  // --- PRIORIDAD 8: PASILLO 8 ---
  // Femenina, aseo personal (cremas, jabon baño, desodorante)
  { 
    keywords: ["intima", "toalla higienica", "protector", "crema dental", "cepillo", "enjuague", "bucal", "corporal", "jabon de baño", "jabon tocador", "shampoo", "capilar", "acondicionador", "desodorante", "afeitadora", "talco"], 
    pasillo: "8", 
    prioridad: 8 
  },

  // --- PRIORIDAD 9: PASILLO 10 --- (OJO: El 10 va antes del 9 en tu ruta)
  // Jabon barra, detergentes, blanqueadores
  { 
    keywords: ["jabon barra", "detergente", "lavadora", "insecticida", "blanqueador", "suavizante", "ropa", "clorox", "varsol"], 
    pasillo: "10", 
    prioridad: 9 
  },

  // --- PRIORIDAD 10: PASILLO 9 ---
  // Aseo hogar, papel higienico
  { 
    keywords: ["escoba", "papel higienico", "trapera", "piso", "limpia piso", "vela", "bolsa basura", "ambientador"], 
    pasillo: "9", 
    prioridad: 10 
  },

  // --- PRIORIDAD 11: PASILLO 11 ---
  // Mascotas, esponjas, cocina
  { 
    keywords: ["mascota", "perro", "gato", "purina", "esponja", "guante", "lavaplatos", "desengrasante", "limpiavidrios"], 
    pasillo: "11", 
    prioridad: 11 
  },

  // --- PRIORIDAD 12: PASILLO 12 ---
  // Bebidas, pasabocas, desechables
  { 
    keywords: ["bebida", "tea", "agua", "jugo", "pasabocas", "papas", "platanito", "chitos", "servilleta", "papel cocina", "desechable", "vaso", "plato"], 
    pasillo: "12", 
    prioridad: 12 
  },

  // --- PRIORIDAD 13: PASILLO 13 ---
  // Refrigerados, Cervezas, Golosinas, Carnes
  { 
    keywords: ["lacteo", "yogurt", "kumis", "queso", "mantequilla", "cerveza", "mani", "nuez", "golosina", "snack", "chocolatina", "dulce", "mexicano", "saludable", "carne", "pollo", "pescado", "res", "cerdo", "salchicha", "jamon", "mortadela"], 
    pasillo: "13", 
    prioridad: 13 
  },

  // --- PRIORIDAD 14: PASILLO 14 ---
  // Gaseosas, Fruver
  { 
    keywords: ["gaseosa", "cola", "soda", "fruta", "verdura", "tomate", "cebolla", "papa", "zanahoria", "limon", "aguacate", "fruver"], 
    pasillo: "14", 
    prioridad: 14 
  }
];

/**
 * Determina el pasillo y prioridad de un producto basado en sus categorías Y su nombre
 * @param {Array} categoriasWC - Array de objetos de categorías de WooCommerce
 * @param {String} nombreProducto - (Opcional) El nombre del producto para búsqueda de respaldo
 */
const obtenerInfoPasillo = (categoriasWC, nombreProducto = "") => {
  // Construimos un string único con toda la info del producto para buscar las palabras clave
  const nombresCategorias = categoriasWC && categoriasWC.length > 0 
    ? categoriasWC.map(c => c.name).join(" ") 
    : "";
    
  const textoBusqueda = (nombresCategorias + " " + nombreProducto).toLowerCase();

  // Iteramos sobre las reglas en orden de prioridad
  for (const regla of REGLAS_PASILLOS) {
    // Si alguna de las palabras clave de esta regla está en el texto del producto...
    if (regla.keywords.some(palabra => textoBusqueda.includes(palabra))) {
      return { pasillo: regla.pasillo, prioridad: regla.prioridad };
    }
  }

  // Si no coincide con ninguna regla, lo mandamos a "Otros" (pero antes de Fruver para no dañar cosas delicadas)
  return { pasillo: "Otros", prioridad: 90 };
};

module.exports = { obtenerInfoPasillo };