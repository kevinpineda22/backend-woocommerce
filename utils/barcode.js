/**
 * Barcode utilities for GS1 parsing
 *
 * Formato GS1 peso variable (EAN-13):
 *   29(prefix 7d) + peso(5d) + check(1d) = 13 dígitos
 *   Ejemplo: 2900089 + 00500 + 3 = 2900089005003
 *
 * - Fruver: el sistema CONSTRUYE el barcode (prefix + peso digitado + check digit)
 * - Carnicería: el picker ESCANEA la etiqueta de la báscula y se valida el item
 */

/**
 * Checks if a barcode is a weighable item (GS1 prefix 29)
 * @param {string} barcode
 * @returns {boolean}
 */
export function isWeighableBarcode(barcode) {
  if (!barcode || typeof barcode !== 'string') return false;
  return barcode.startsWith('29');
}

/**
 * Validates an EAN-13 barcode format (exactly 13 digits)
 * @param {string} barcode
 * @returns {boolean}
 */
export function isValidEAN13(barcode) {
  if (!barcode || typeof barcode !== 'string') return false;
  return barcode.length === 13 && /^\d+$/.test(barcode);
}

/**
 * Calculates the GS1 standard check digit.
 * @param {string} codigo - 12 digits WITHOUT the check digit
 * @returns {string|null} check digit (0-9) or null if invalid
 */
export function calcularDigitoVerificador(codigo) {
  if (!codigo || codigo.length !== 12 || !/^\d+$/.test(codigo)) return null;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(codigo[i]);
    const weight = (12 - i) % 2 === 1 ? 3 : 1;
    sum += d * weight;
  }
  return ((10 - (sum % 10)) % 10).toString();
}

/**
 * Extracts the GS1 prefix (first 7 digits: "29" + 5-digit item code)
 * @param {string} barcode - Complete GS1 barcode
 * @returns {string|null} 7-digit prefix or null if invalid
 */
export function extractGS1Prefix(barcode) {
  if (!isWeighableBarcode(barcode) || !isValidEAN13(barcode)) return null;
  return barcode.substring(0, 7);
}

/**
 * Extracts the item/PLU code (5 digits after "29")
 * @param {string} barcode - Complete GS1 barcode
 * @returns {string|null} 5-digit item code or null if invalid
 */
export function extractItemCode(barcode) {
  if (!isWeighableBarcode(barcode) || !isValidEAN13(barcode)) return null;
  return barcode.substring(2, 7);
}

/**
 * Extracts the weight in grams from a GS1 weighable barcode.
 * Format: 29(7d prefix) + peso(5d) + check(1d) = 13 digits
 * Weight is at positions 7-11 (5 digits).
 * @param {string} barcode - The GS1 weighable barcode
 * @returns {number|null} weight in grams, or null if invalid
 */
export function extractWeight(barcode) {
  if (!isWeighableBarcode(barcode) || !isValidEAN13(barcode)) return null;
  return parseInt(barcode.slice(7, 12), 10);
}

/**
 * Builds a complete GS1 EAN-13 barcode for fruver.
 * @param {string} prefix - 7-digit GS1 prefix (e.g., "2900089")
 * @param {number} weightGrams - Weight in grams (e.g., 500)
 * @returns {string|null} 13-digit EAN-13 barcode or null if invalid
 */
export function buildFruverBarcode(prefix, weightGrams) {
  if (!prefix || prefix.length !== 7 || !prefix.startsWith('29')) return null;
  if (typeof weightGrams !== 'number' || weightGrams < 0 || weightGrams > 99999) return null;

  const pesoStr = Math.round(weightGrams).toString().padStart(5, '0');
  const sinCheck = `${prefix}${pesoStr}`;
  const checkDigit = calcularDigitoVerificador(sinCheck);
  if (!checkDigit) return null;

  return `${sinCheck}${checkDigit}`;
}
