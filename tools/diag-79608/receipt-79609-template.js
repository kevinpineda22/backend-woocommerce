/**
 * Template para transcribir la factura física del pedido 79609
 *
 * Instrucciones:
 * 1. Completar el array `lines` con cada línea de la factura
 * 2. Para cada producto:
 *    - sku: código del producto (si aparece)
 *    - name: nombre del producto
 *    - qty: cantidad
 *    - um: unidad de medida (UND, KL, LB, P2, etc.)
 *    - unit_price: precio unitario que cobra la caja
 *    - gross: total de la línea ANTES de descuento
 *    - dscto: descuento aplicado (0 si no hay)
 *    - net: total cobrado (gross - dscto)
 * 3. Ejecutar compare-79609-vs-pos.js
 */

module.exports = {
  order_id: 79609,
  receipt_total: 396683, // Total factura física
  domicilio: 6000, // Si tiene domicilio incluido en el total
  bolsas: 0, // Si tiene bolsas incluidas

  // COMPLETAR ESTE ARRAY CON LOS DATOS DE LA FACTURA:
  lines: [
    // Ejemplo:
    // { sku: "1032P2", name: "Atún Alamar", qty: 1, um: "P2", unit_price: 8990, gross: 8990, dscto: 0, net: 8990 },
    // { sku: "5107LB", name: "Zanahoria", qty: 0.615, um: "KL", unit_price: 2030, gross: 1248, dscto: 0, net: 1248 },
    // AGREGAR TODAS LAS LÍNEAS AQUÍ...
  ],
};
