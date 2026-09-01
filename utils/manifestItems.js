/**
 * Construye la lista canónica de ítems del manifiesto / QR de salida.
 * Módulo PURO. Guardado por `utils/manifestItems.test.js`.
 *
 * ══════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE
 * ══════════════════════════════════════════════════════════════════
 *
 * El QR se armaba recorriendo `products_map`, y `products_map` es un índice
 * de CONSULTA por id, no una lista de ítems. Eso producía dos errores que
 * llegaron a la caja:
 *
 *   DUPLICACIÓN — cada línea con variación se escribe en `products_map` bajo
 *     `product_id` Y bajo `variation_id`. Recorrer el mapa emitía el producto
 *     dos veces. Solo pasaba con productos variables: por eso el reporte era
 *     "A VECES duplica".
 *
 *   OMISIÓN — dos líneas distintas podían generar el mismo código
 *     (`f120_id + UM`) cuando la presentación se resolvía igual para ambas.
 *     La caja las leía como un solo producto.
 *
 * La lista de acá tiene UNA entrada por línea de pedido real, identificada
 * por `${order_id}-${line_item_id}`, que es único por definición. Además
 * reporta explícitamente las colisiones y los ítems sin código resoluble,
 * en vez de emitir una línea de QR inválida en silencio.
 */

const { buildManifestCode } = require("./siesaMatching");

/**
 * @param {Object} params
 * @param {Array} params.ordersData — pedidos con `id` e `items` (líneas de Woo)
 * @param {Object} params.productDetailsMap — índice por product_id / variation_id
 * @returns {{items: Array, warnings: {colisiones: Array, sin_codigo: Array}}}
 */
function buildManifestItems({ ordersData = [], productDetailsMap = {} }) {
  const items = [];

  ordersData.forEach((order) => {
    (order.items || []).forEach((item) => {
      const detalle =
        productDetailsMap[item.variation_id] ||
        productDetailsMap[item.product_id] ||
        {};
      const f120_id = parseInt(item.sku, 10);

      items.push({
        // Identidad única: una línea de Woo dentro de su pedido.
        key: `${order.id}-${item.id}`,
        order_id: order.id,
        line_item_id: item.id,
        product_id: item.product_id,
        variation_id: item.variation_id || null,
        name: item.name,
        sku: item.sku,
        qty: item.quantity,
        // ⚠️ DOS unidades distintas, no intercambiables:
        //   `unidad_medida`       — la de WooCommerce: presentación física que
        //     compró el cliente. Gobierna peso (`kgPerUnit`) y cobro.
        //   `unidad_medida_siesa` — cómo está catalogado el código en SIESA.
        //     Solo para armar el código que lee la caja.
        // Confundirlas duplica el peso del GS1: ver la nota en
        // dashboardController (caso "Tocino Carnudo Kilo - 500g").
        unidad_medida: detalle.unidad_medida || null,
        unidad_medida_siesa: detalle.unidad_medida_siesa || null,
        unidad_medida_confiable: detalle.unidad_medida_confiable === true,
        barcode: detalle.barcode || null,
        // Prefijo GS1 REAL de SIESA para pesables. El manifiesto lo usa para
        // armar el código de báscula en vez de fabricarlo desde el SKU.
        gs1_base: detalle.gs1_base || null,
        // null = no hay código resoluble en la caja. El frontend debe
        // mostrarlo como pendiente, NO emitir una línea de QR inválida.
        // Se elige entre los códigos REALES del producto (los que ya vienen
        // resueltos en `detalle.barcode_sku_um`); nunca se fabrica uno.
        codigo_manifiesto:
          detalle.barcode_sku_um ||
          buildManifestCode({
            f120_id,
            um: detalle.unidad_medida_siesa || detalle.unidad_medida,
            barcode: detalle.barcode,
            siesaRows: (detalle.barcodes_producto || []).map((c) => ({
              f120_id,
              codigo_barras: c,
              unidad_medida: detalle.unidad_medida_siesa,
            })),
          }),
      });
    });
  });

  // Colisiones: dos PRODUCTOS DISTINTOS del mismo pedido que emitirían el
  // mismo código. La caja los leería como uno solo — ahí se pierde plata.
  //
  // Se agrupa por pedido porque la caja factura pedido por pedido: el mismo
  // código en dos pedidos distintos es correcto.
  //
  // ⚠️ Y se compara la IDENTIDAD del producto, no la línea. WooCommerce parte
  // el mismo producto en dos líneas seguido (pedido real 81399: "Cascara Kilo
  // - 500g" en dos líneas de qty 1). Ahí el QR emite el código dos veces y la
  // caja suma bien: NO es colisión. Avisar de eso entrena a la gente a
  // ignorar el aviso, y entonces la colisión de verdad tampoco se ve.
  const porCodigo = {};
  items.forEach((it) => {
    if (!it.codigo_manifiesto) return;
    const k = `${it.order_id}|${it.codigo_manifiesto}`;
    (porCodigo[k] = porCodigo[k] || []).push(it);
  });

  const colisiones = Object.entries(porCodigo)
    .map(([k, grupo]) => {
      const identidades = new Set(
        grupo.map((it) => `${it.product_id}|${it.variation_id || 0}`),
      );
      if (identidades.size < 2) return null; // mismo producto: la caja suma bien
      return {
        order_id: k.split("|")[0],
        codigo: k.split("|")[1],
        items: grupo.map((it) => it.key),
        productos: grupo.map((it) => it.name),
      };
    })
    .filter(Boolean);

  const sin_codigo = items
    .filter((it) => !it.codigo_manifiesto)
    .map((it) => ({ key: it.key, name: it.name, sku: it.sku }));

  return { items, warnings: { colisiones, sin_codigo } };
}

module.exports = { buildManifestItems };
