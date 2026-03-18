/**
 * Utilidades GS1 para códigos de barras de peso variable (carnicería/fruver).
 *
 * Formato GS1 carnicería: 29(item 5 dígitos)[0 padding](peso 5 dígitos)(check 1 dígito)
 *   - 13 dígitos: 29 + item(5) + peso(5) + check(1)
 *   - 14 dígitos: 29 + item(5) + 0 + peso(5) + check(1)
 */

/**
 * Calcula el dígito verificador EAN-13 estándar.
 * @param {string} codigo12 - Los primeros 12 dígitos del código EAN.
 * @returns {string|null} El dígito verificador (0-9) o null si el input es inválido.
 */
export const calcularDigitoVerificador = (codigo12) => {
  if (codigo12.length !== 12) return null;
  let sumaImpares = 0;
  let sumaPares = 0;
  for (let i = 0; i < 12; i++) {
    const digito = parseInt(codigo12[i]);
    if ((i + 1) % 2 !== 0) sumaImpares += digito;
    else sumaPares += digito;
  }
  const total = sumaImpares + sumaPares * 3;
  const siguienteDecena = Math.ceil(total / 10) * 10;
  return (siguienteDecena - total).toString();
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

/**
 * Valida que un peso esté dentro de la tolerancia ±50g.
 * @param {number} actualWeightKg - Peso real en Kg.
 * @param {number} requestedKg - Peso solicitado en Kg.
 * @returns {{ valid: boolean, error: string|null }}
 */
export const validateWeightTolerance = (actualWeightKg, requestedKg) => {
  const minAllowed = requestedKg - 0.05;
  const maxAllowed = requestedKg + 0.05;

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
