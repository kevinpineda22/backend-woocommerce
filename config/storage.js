/**
 * Configuración centralizada para URLs de almacenamiento
 * Usa esto para importar imágenes desde Cloudflare R2 en lugar de la carpeta public local.
 */

// Bucket para assets generales (logos, iconos, videos)
export const ASSETS_URL = "https://pub-77c11d717b7741f686bae6f71d51a9ea.r2.dev/";

// Bucket para productos (60k fotos)
export const PRODUCTS_URL = "https://pub-45913f49b274424eadd3b762a0b24df9.r2.dev/";

/**
 * Genera la URL completa para un asset general
 * @param {string} path - Nombre del archivo o ruta relativa (ej: "logo.png")
 * @returns {string} URL completa
 */
export const getAssetUrl = (path) => {
  if (!path) return "";
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${ASSETS_URL}${cleanPath}`;
};

/**
 * Genera la URL completa para una foto de producto
 * @param {string} productId - ID del producto (ej: "REF-1020")
 * @returns {string} URL completa
 */
export const getProductImageUrl = (productId) => {
  if (!productId) return `${ASSETS_URL}sin-imagen.png`; // Fallback a una imagen por defecto en assets
  return `${PRODUCTS_URL}${productId}.jpg`;
};
