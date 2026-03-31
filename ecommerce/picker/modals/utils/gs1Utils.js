/**
 * Utilidades GS1 para códigos de barras de peso variable (carnicería/fruver).
 *
 * Formato: 29(item tal cual)(0 separador)(peso 5 dígitos)(check 1 dígito)
 *   - Item 4 dígitos → 13 dígitos total: 29 + item(4) + 0 + peso(5) + check(1)
 *   - Item 5 dígitos → 14 dígitos total: 29 + item(5) + 0 + peso(5) + check(1)
 */

/**
 * Calcula el dígito verificador GS1 estándar.
 * Soporta 12 dígitos (→ EAN-13) y 13 dígitos (→ EAN-14).
 * @param {string} codigo - Los dígitos del código SIN el dígito verificador.
 * @returns {string|null} El dígito verificador (0-9) o null si el input es inválido.
 */
export const calcularDigitoVerificador = (codigo) => {
  if (codigo.length < 12 || codigo.length > 13) return null;
  if (!/^\d+$/.test(codigo)) return null; // Rechazar si contiene letras u otros caracteres
  const n = codigo.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = parseInt(codigo[i]);
    // Desde la derecha: posición impar ×3, par ×1
    const weight = (n - i) % 2 === 1 ? 3 : 1;
    sum += d * weight;
  }
  return ((10 - (sum % 10)) % 10).toString();
};

/**
 * Determina si un código es GS1 de peso variable.
 * @param {string} code - Código limpio (solo dígitos).
 * @returns {boolean}
 */
export const isGS1Variable = (code) => {
  if (!code) return false;
  return (
    (code.length === 13 || code.length === 14) &&
    /^\d+$/.test(code) &&
    code.startsWith("2")
  );
};

/**
 * Extrae el prefijo GS1 (29 + item de 5 dígitos = 7 dígitos).
 * Siempre son los primeros 7 dígitos, sin importar si es 13 o 14 dígitos.
 * @param {string} gs1Code - Código GS1 completo.
 * @returns {string} Prefijo de 7 dígitos.
 */
export const extractGS1Prefix = (gs1Code) => {
  return gs1Code.substring(0, 7);
};

/**
 * Extrae el PLU/Item (5 dígitos) del código GS1.
 * Siempre en posiciones 2-6 (después del prefijo "29").
 * @param {string} gs1Code - Código GS1 completo.
 * @returns {string} PLU de 5 dígitos.
 */
export const extractGS1Sku = (gs1Code) => {
  return gs1Code.substring(2, 7);
};

/**
 * Extrae el peso en kilogramos de un código GS1 de peso variable.
 * @param {string} gs1Code - Código GS1 completo (13 o 14 dígitos).
 * @returns {number} Peso en Kg (0 si no se puede extraer).
 */
export const extractWeightFromGS1 = (gs1Code) => {
  if (!isGS1Variable(gs1Code)) return 0;
  const startIdx = gs1Code.length === 13 ? 7 : 8;
  const endIdx = gs1Code.length === 13 ? 12 : 13;
  const pesoGramos = parseInt(gs1Code.substring(startIdx, endIdx));
  return !isNaN(pesoGramos) && pesoGramos > 0 ? pesoGramos / 1000 : 0;
};

/**
 * Convierte peso solicitado a Kg para validación de tolerancias.
 * @param {number} requested - Cantidad solicitada.
 * @param {string} unidad - Unidad de medida (KG, LB, etc.).
 * @returns {number} Peso en Kg.
 */
export const toKgForValidation = (requested, unidad) => {
  const um = (unidad || "KG").toUpperCase();
  return um === "LB" || um === "LIBRA" ? requested / 2 : requested;
};

/** Tolerancia de peso GS1 en Kg (±50g). */
export const GS1_WEIGHT_TOLERANCE_KG = 0.05;

/**
 * Valida que un peso esté dentro de la tolerancia ±50g.
 * @param {number} actualWeightKg - Peso real en Kg.
 * @param {number} requestedKg - Peso solicitado en Kg.
 * @returns {{ valid: boolean, error: string|null }}
 */
export const validateWeightTolerance = (actualWeightKg, requestedKg) => {
  const minAllowed = requestedKg - GS1_WEIGHT_TOLERANCE_KG;
  const maxAllowed = requestedKg + GS1_WEIGHT_TOLERANCE_KG;

  if (actualWeightKg < minAllowed) {
    return {
      valid: false,
      error: `❌ Mínimo permitido: ${minAllowed.toFixed(3)} Kg (Etiqueta indica: ${actualWeightKg.toFixed(3)} Kg)`,
    };
  }
  if (actualWeightKg > maxAllowed) {
    return {
      valid: false,
      error: `❌ Máximo permitido: ${maxAllowed.toFixed(3)} Kg (Excedido por ${((actualWeightKg - maxAllowed) * 1000).toFixed(0)}g)`,
    };
  }
  return { valid: true, error: null };
};

/**
 * Formateador de moneda en Pesos Colombianos.
 */
export const formatCOP = (p) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(p);
