/**
 * Lógica pura de filtrado y resolución de códigos de barras SIESA.
 * Extraída de los controllers para ser testeable de forma aislada.
 */

const { isWeighableUnit } = require("./weighableUnits");

/**
 * Valida si un código de barras de SIESA es aceptable.
 * Permite: dígitos puros (EAN), dígitos+UM (SKU+UM como 185325P25), dígitos con +
 * Excluye: prefijo M/N, códigos muy cortos, formatos no reconocidos.
 * @param {string} rawCode - Código de barras tal como viene de SIESA
 * @returns {boolean}
 */
function isValidSiesaBarcode(rawCode) {
  if (!rawCode) return false;
  const code = rawCode.toString().trim();
  const cleaned = code.replace(/\+$/, "");
  if (!cleaned || cleaned.length < 4) return false;
  if (/^[MN]\d/i.test(cleaned)) return false;
  return /^\d+([A-Z]*\d*)?\+?$/i.test(code);
}

/**
 * Limpia un código de barras de SIESA (quita trailing +).
 * @param {string} rawCode
 * @returns {string}
 */
function cleanSiesaCode(rawCode) {
  if (!rawCode) return "";
  return rawCode.toString().trim().replace(/\+$/, "");
}

/**
 * Normaliza una unidad de medida al formato canónico de SIESA.
 * UN/UNIDAD → UND, KG/KILO → KL, LB/LIBRA → LB, vacío → DEFAULT
 * @param {string} um
 * @returns {string}
 */
function normalizeUnitMeasure(um) {
  const normalized = (um || "").toUpperCase().trim();
  if (normalized === "UN" || normalized === "UNIDAD") return "UND";
  if (normalized === "KG" || normalized === "KILO") return "KL";
  if (normalized === "LB" || normalized === "LIBRA") return "LB";
  if (normalized === "" || normalized === "NULL" || normalized === "DEFAULT")
    return "DEFAULT";
  return normalized;
}

/**
 * Infiere la unidad de medida más probable desde el nombre del producto.
 * Retorna { um, confident } donde confident=true si un keyword hizo match real.
 *
 * @param {string} productName - Nombre del producto en WooCommerce
 * @param {string[]} availableUMs - Unidades de medida disponibles en SIESA para ese f120_id
 * @returns {{ um: string|null, confident: boolean }}
 */
function inferUnitMeasureFromName(productName, availableUMs) {
  if (!availableUMs || availableUMs.length === 0)
    return { um: null, confident: false };
  if (availableUMs.length === 1)
    return { um: availableUMs[0], confident: true };

  const nameUpper = (productName || "").toUpperCase();

  // 1. Detección dinámica: "Paca x25" → P25, "X 12" → P12, etc.
  const dynamicMatch =
    nameUpper.match(
      /(?:PACA|PACK|BULTO|BOLSA|CAJA|DISPLAY)\s*(?:X|DE)?\s*(\d+)/i,
    ) || nameUpper.match(/X\s*(\d+)\s*(?:UN|UND|H|R|\b)/i);
  if (dynamicMatch) {
    const n = dynamicMatch[1];
    const candidateUM = `P${n}`;
    if (availableUMs.includes(candidateUM)) {
      return { um: candidateUM, confident: true };
    }
  }

  // 2. Pistas estáticas por patrón de nombre
  const patterns = {
    P2: ["DÚO", "DOS", "2UN", "X2", "PAIR", "DUPLO"],
    P3: ["TRÍO", "TRES", "3UN", "X3", "TRIPLO"],
    P4: ["CUATRO", "4UN", "X4", "QUADRO"],
    P6: ["SEIS", "SIX", "6UN", "X6", "SIXPACK"],
    P10: ["DIEZ", "10UN", "X10"],
    P12: ["DOCE", "TWELVE", "12UN", "X12", "DOCENA"],
    P18: ["DIECIOCHO", "18UN", "X18"],
    P24: ["VEINTICUATRO", "24UN", "X24"],
    P25: ["PACA", "VEINTICINCO", "25UN", "X25"],
    P30: ["TREINTA", "30UN", "X30"],
    P48: ["CUARENTA Y OCHO", "48UN", "X48"],
    UND: ["UNIDAD", "UNITARIO", "SOLO", "INDIVIDUAL"],
    KL: ["KILO", "KG"],
    LB: ["LIBRA", "LB"],
  };

  for (const [um, keywords] of Object.entries(patterns)) {
    if (availableUMs.includes(um)) {
      if (keywords.some((kw) => nameUpper.includes(kw))) {
        return { um, confident: true };
      }
    }
  }

  // Sin pista en el nombre → baja confianza, retornar UND si disponible, sino la primera
  const fallbackUm = availableUMs.includes("UND") ? "UND" : availableUMs[0];
  return { um: fallbackUm, confident: false };
}

/**
 * Genera el código SKU+UM (ej: "185325P25") para un producto.
 * @param {number|string} f120_id
 * @param {string} unidadMedida - Ya normalizada
 * @returns {string}
 */
function buildBarcodeSkuUm(f120_id, unidadMedida) {
  const id = parseInt(f120_id);
  if (isNaN(id)) return "";
  const um = normalizeUnitMeasure(unidadMedida);
  if (!um || um === "DEFAULT") return `${id}`;
  return `${id}${um}`;
}

/**
 * Determina si un código de barras ya tiene el formato SKU+UM (dígitos + letras).
 * Ej: "185325P25" → true, "7709138700037" → false
 * @param {string} code
 * @returns {boolean}
 */
function isSkuUmFormat(code) {
  if (!code) return false;
  return /^\d+[A-Z]+\d*$/i.test(code.toString().trim());
}

/**
 * Resuelve el barcode final para el manifiesto dado un item con sus datos.
 * Replica la lógica de getDisplayCode del ManifestSheet.
 * @param {Object} item - { barcode, sku, unidad_medida, peso_total, qty }
 * @returns {string}
 */
function resolveManifestBarcode(item) {
  const barcode = (item.barcode || "").toString().trim().replace(/\+$/, "");
  const sku = item.sku || "";
  const isWeighable = isWeighableUnit(item.unidad_medida);

  // Prioridad 1: GS1 "29" ya construido
  if (/^\d{13,14}$/.test(barcode) && barcode.startsWith("29")) {
    return barcode;
  }

  // Prioridad 2: Pesable → construir GS1 (skip here, tested elsewhere)

  // Prioridad 3: SKU+UM ya presente en barcode
  if (isSkuUmFormat(barcode)) {
    return barcode;
  }

  // Prioridad 4: Construir SKU+UM desde datos del item
  if (sku && item.unidad_medida && !isWeighable) {
    const numSku = (sku.match(/^(\d+)/) || [])[1] || "";
    const umUpper = item.unidad_medida.toUpperCase();
    if (numSku && umUpper) {
      return `${numSku}${umUpper}`;
    }
  }

  // Prioridad 5: barcode crudo
  if (barcode) {
    const stripped = barcode.toUpperCase();
    if (stripped.startsWith("M") || stripped.startsWith("N"))
      return barcode.substring(1);
    return barcode;
  }

  // Prioridad 6: SKU limpio
  if (sku) return sku.replace(/-/g, "");

  return "";
}

module.exports = {
  isValidSiesaBarcode,
  cleanSiesaCode,
  normalizeUnitMeasure,
  inferUnitMeasureFromName,
  buildBarcodeSkuUm,
  isSkuUmFormat,
  resolveManifestBarcode,
};
