/**
 * Cálculo de cobro por línea para manifiesto / totales de sesión.
 * Versión FRONTEND (ESM).
 *
 * ⚠️ MANTENER EN SYNC con `utils/manifestPricing.js` (backend CJS).
 *
 * Por qué existe este módulo:
 *   El cálculo `price × qty` falla para productos pesables. WooCommerce
 *   guarda `qty` como cantidad solicitada (ej: 3 LB) pero la caja registradora
 *   cobra contra el peso REAL pesado por el picker (`peso_total`).
 *
 * Convención de unidades en este negocio (verificada contra factura POS 79608):
 *   KL / KG / KILO  → `price` es por kilo            → cobro = price × peso
 *   LB / LIBRA      → `price` es por MEDIA LIBRA (500g) → cobro = price × 2 × peso
 *   500GR / 500G    → `price` es por 500g            → cobro = price × 2 × peso
 *   resto (UND/P2/P6/etc.) → cobro = price × qty
 *
 * El sufijo del SKU manda sobre `unidad_medida`. En el pedido 79608 hay items
 * con sku=15151LB pero `unidad_medida="KL"`. La caja cobra según el SKU/SIESA,
 * así que el SKU es la fuente de verdad operativa.
 */

const KG_UNIT_TOKENS = new Set(["kl", "kg", "kilo"]);
const HALF_KG_UNIT_TOKENS = new Set(["lb", "libra", "500gr", "500g", "500grs"]);

function classifyWeighable(item) {
  const sku = (item.sku_final || item.sku || "").toString().toLowerCase();
  const skuSuffix = sku.match(/[a-z]+\d*$/)?.[0] || "";
  if (HALF_KG_UNIT_TOKENS.has(skuSuffix)) return "half";
  if (KG_UNIT_TOKENS.has(skuSuffix)) return "kg";

  const um = (item.unidad_medida || "").toString().toLowerCase();
  if (HALF_KG_UNIT_TOKENS.has(um)) return "half";
  if (KG_UNIT_TOKENS.has(um)) return "kg";

  return null;
}

export function calcLineCharge(item) {
  if (!item) return 0;
  const qty = item.qty || item.count || item.quantity || 1;
  const peso = parseFloat(item.peso_total) || 0;
  const price =
    parseFloat(item.price) ||
    parseFloat(item.line_total) ||
    parseFloat(item.catalog_price) ||
    0;

  if (peso > 0) {
    const kind = classifyWeighable(item);
    if (kind === "kg") return Math.round(price * peso);
    if (kind === "half") return Math.round(price * 2 * peso);
  }

  const unitFinal =
    parseFloat(item.line_total) ||
    parseFloat(item.price) ||
    parseFloat(item.catalog_price) ||
    0;
  return Math.round(unitFinal * qty);
}
