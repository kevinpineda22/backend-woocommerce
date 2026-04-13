// Constantes y helpers para método de despacho en manifiesto de salida
// Ítems SIESA virtuales que el POS necesita para identificar tipo de despacho

const SHIPPING_BARCODES = {
  DOMICILIO: "304", // Ítem 188745 — Domicilio e-commerce envío
  RECOGIDA: "305", // Ítem 188746 — Recogida en tienda
};

const SHIPPING_LABELS = {
  DOMICILIO: "Domicilio e-commerce envío",
  RECOGIDA: "Recogida en tienda",
};

/**
 * Detecta si un pedido es de recogida en tienda basándose en shipping_lines.
 * @param {Array} shippingLines — array de shipping_lines del pedido WooCommerce
 * @returns {boolean}
 */
const isPickupOrder = (shippingLines) => {
  if (!Array.isArray(shippingLines)) return false;
  return shippingLines.some((ship) => ship.method_id === "local_pickup");
};

/**
 * Genera el ítem virtual de método de despacho para incluir en el manifiesto.
 * @param {string} orderId — ID del pedido
 * @param {Array} shippingLines — shipping_lines del pedido
 * @returns {object} ítem virtual con is_shipping_method: true
 */
const buildShippingItem = (orderId, shippingLines) => {
  const pickup = isPickupOrder(shippingLines);
  return {
    id: `shipping-${orderId}`,
    sku: pickup ? SHIPPING_BARCODES.RECOGIDA : SHIPPING_BARCODES.DOMICILIO,
    name: pickup ? SHIPPING_LABELS.RECOGIDA : SHIPPING_LABELS.DOMICILIO,
    qty: 1,
    price: 0,
    barcode: pickup ? SHIPPING_BARCODES.RECOGIDA : SHIPPING_BARCODES.DOMICILIO,
    is_shipping_method: true,
  };
};

module.exports = {
  SHIPPING_BARCODES,
  SHIPPING_LABELS,
  isPickupOrder,
  buildShippingItem,
};
