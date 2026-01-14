// data/categoriaPasillos.js

/**
 * ARCHIVO DE CONFIGURACIÓN DE PASILLOS
 * -----------------------------------------------------
 * En lugar de adivinar con "palabras clave", defina aquí
 * EXACTAMENTE a qué pasillo debe ir cada categoría de su tienda.
 * 
 * Ventajas:
 * 1. Precisión del 100%
 * 2. No confunde "Granulado" con "Granos"
 * 3. Fácil de editar
 */

// data/categoriaPasillos.js

/**
 * CONFIGURACIÓN DE PASILLOS Y SUS CATEGORÍAS
 * -----------------------------------------------------
 * Define qué categorías (o palabras clave de categoría) pertenecen a qué pasillo.
 * El sistema buscará si el nombre de la categoría del producto 
 * CONTIENE alguna de estas palabras.
 */

const DEFINICION_PASILLOS = [
  {
    pasillo: "2",
    nombre: "Despensa Básica",
    categorias: ["huevos", "atunes", "enlatados", "pastas"]
  },
  {
    pasillo: "1",
    nombre: "Granos y Condimentos",
    categorias: ["arroz", "azucar", "grano", "vinagretas", "salsas", "sazonador"]
  },
  {
    pasillo: "3",
    nombre: "Aceites y Harinas",
    categorias: ["harinas", "margarinas", "sopas", "aceite vegetal", "aceite soya", "aceite oliva", "aceite"]
  },
  {
    pasillo: "4",
    nombre: "Polvos y Repostería",
    categorias: ["refrescos en polvo", "gelatina", "reposteria", "arequipe", "leche larga vida"]
  },
  {
    pasillo: "6",
    nombre: "Café y Panadería",
    categorias: ["pan de sal", "chocolate", "cafe molido", "cafe premium", "cafe soluble", "cafe", "pan"]
  },
  {
    pasillo: "5",
    nombre: "Galletas y Dulces",
    categorias: ["pan dulce", "avenas", "galleta salada", "galleta dulce", "galleta saludable", "galletas"]
  },
  {
    pasillo: "7",
    nombre: "Bebé y Adulto",
    // "parte adulto" se simplifica a "adulto" para mayor cobertura
    categorias: ["adulto", "pañitos humedos", "pañales", "cereales", "leche en polvo", "granola", "bebe"]
  },
  {
    pasillo: "8",
    nombre: "Cuidado Personal",
    // "parte femenina" -> "femenina"
    categorias: ["femenina", "cremas dentales", "cremas detales", "cremas corporales", "jabon de baño", "higiene capilar", "desodorantes", "oral"]
  },
  {
    pasillo: "10",
    nombre: "Aseo Ropa",
    categorias: ["jabon barra", "detergente liquido", "detergente en polvo", "insecticidas", "blanqueadores", "suavizantes", "ropa"]
  },
  {
    pasillo: "9",
    nombre: "Aseo Hogar",
    categorias: ["escobas", "papel higienico", "traperas", "limpia piso", "velas", "aseo hogar"]
  },
  {
    pasillo: "11",
    nombre: "Mascotas y Cocina",
    categorias: ["mascotas", "esponjas", "guantes", "lavaplatos", "desengrasante"]
  },
  {
    pasillo: "12",
    nombre: "Bebidas y Desechables",
    categorias: ["bebidas", "pasabocas", "servilletas", "papel cocina", "desechables"]
  },
  {
    pasillo: "13",
    nombre: "Refrigerados y Carnes",
    // "nevera de..." se simplifica
    categorias: ["lacteos derivados", "lacteos", "cervezas", "mani", "golosinas", "nueces", "mexicano", "saludable", "carnes frias", "carniceria", "embutidos"]
  },
  {
    pasillo: "14",
    nombre: "Gaseosas y Fruver",
    // "nevera de gaseosas" -> "gaseosas"
    categorias: ["gaseosas", "fruver", "fruta", "verdura"]
  }
];

module.exports = DEFINICION_PASILLOS;
