/**
 * Arma el payload de `line_items` que se manda a WooCommerce al cerrar la
 * auditoría. Módulo PURO: recibe el pedido de Woo y los logs de picking ya
 * consultados, y devuelve el array de líneas. Sin I/O, sin supabase.
 *
 * Se extrajo de `services/syncWooService.js` porque acá se decide QUÉ SE LE
 * COBRA AL CLIENTE, y esa decisión estaba enterrada dentro de una función con
 * cinco consultas a la base: imposible de testear, y por eso un sustituto que
 * ya estaba en el pedido lo duplicaba en la factura sin que nadie lo notara.
 *
 * Guardado por `utils/wooLinePayload.test.js`.
 *
 * ══════════════════════════════════════════════════════════════════
 * REGLAS DE NEGOCIO
 * ══════════════════════════════════════════════════════════════════
 *
 * ÍTEM NO ENCONTRADO — la línea NO se borra del pedido: sigue visible con su
 *   cantidad original para que el cliente vea qué pidió, pero se cobra solo lo
 *   que se entregó (`picked_qty × precio`) y se marca con el meta "NO ENTREGADO".
 *   Sin unidades recolectadas, el cobro queda en $0.
 *
 * LA LÍNEA SOLO DESAPARECE cuando la unidad salió de verdad del pedido:
 *   sustitución total (se agrega la línea del sustituto) o retiro del admin.
 *
 * PESABLES — el `price` de Woo sigue la convención de la caja POS:
 *   LB / LIBRA / 500GR → price es por MEDIA libra → cobro = price × 2 × peso.
 *   KL / KG / KILO (o desconocido) → cobro = price × peso.
 *   La clasificación es de `manifestPricing` (el SKU es la fuente de verdad).
 *
 * SUSTITUTO QUE YA ESTÁ EN EL PEDIDO — se SUMA a la línea existente. Agregarlo
 *   como línea nueva dejaba el producto duplicado en la factura del cliente.
 */

const { classifyWeighable } = require("./manifestPricing");

/**
 * @param {Object} params
 * @param {Object} params.wooOrder — pedido de WooCommerce (necesita line_items)
 * @param {Array}  params.logs — filas de wc_log_picking de la asignación
 * @param {Array}  [params.adminRemovals] — filas `eliminado_admin` de la SESIÓN
 * @returns {{lineItems: Array, resumen: Object}}
 */
function buildLineItemsPayload({ wooOrder, logs = [], adminRemovals = [] }) {
  const productMap = {};

  // A. Llenar con lo solicitado.
  // La clave es `variation_id` cuando existe, porque los logs de picking
  // guardan el variation_id en `id_producto`. `pidToKey` es el mapa inverso
  // para los logs que traen el product_id padre.
  const pidToKey = {};
  (wooOrder.line_items || []).forEach((item) => {
    const effectiveKey = item.variation_id || item.product_id;
    productMap[effectiveKey] = {
      line_id: item.id,
      name: item.name,
      sku: item.sku || "",
      original_price: parseFloat(item.price || 0),
      requested_qty: item.quantity,
      picked_qty: 0,
      subbed_qty: 0,
      notfound_qty: 0,
      removed_by_admin: false,
      weight_total: 0,
    };
    pidToKey[item.product_id] = effectiveKey;
    if (item.variation_id) pidToKey[item.variation_id] = effectiveKey;
  });

  // Resuelve la línea de Woo a la que pertenece un log (directo o vía variación)
  const resolveKey = (logProdId) =>
    productMap[logProdId] ? logProdId : pidToKey[logProdId] || null;

  // B. Procesar los logs para entender qué pasó de verdad.
  const itemsToAdd = [];
  logs.forEach((log) => {
    const key = resolveKey(log.id_producto);

    if (log.accion === "recolectado" && !log.es_sustituto) {
      if (key && productMap[key]) {
        productMap[key].picked_qty += 1;
        if (log.peso_real && parseFloat(log.peso_real) > 0) {
          productMap[key].weight_total += parseFloat(log.peso_real);
        }
      }
    } else if (log.accion === "sustituido") {
      itemsToAdd.push({
        product_id: log.id_producto_final,
        qty: 1,
        price: parseFloat(log.precio_nuevo || 0),
      });
      // La unidad sustituida SÍ sale de la línea original.
      if (key && productMap[key]) productMap[key].subbed_qty += 1;
    } else if (log.accion === "no_encontrado") {
      if (key && productMap[key]) productMap[key].notfound_qty += 1;
    }
  });

  // Anulaciones del admin (log a nivel de SESIÓN, no de pedido).
  (adminRemovals || []).forEach((r) => {
    const key = resolveKey(r.id_producto);
    if (key && productMap[key]) productMap[key].removed_by_admin = true;
  });

  // C. Construir el payload.
  const lineItems = [];
  const resumen = { pesables: 0, no_entregados: 0, eliminados: 0, sustitutos_nuevos: 0, sustitutos_fusionados: 0 };

  for (const prodId in productMap) {
    const item = productMap[prodId];
    const targetQty = item.removed_by_admin
      ? 0
      : Math.max(0, item.requested_qty - item.subbed_qty);

    if (item.weight_total > 0 && item.picked_qty > 0) {
      const kind = classifyWeighable({ sku: item.sku });
      const factor = kind === "half" ? 2 : 1;
      const nuevoTotal = item.original_price * factor * item.weight_total;

      const metaPeso = [
        { key: "Peso Real Facturado", value: `${item.weight_total} Kg` },
        { key: "_picking_adjusted", value: "true" },
      ];
      // Pesable con unidades faltantes: se factura solo el peso realmente
      // pesado, así que el faltante ya queda sin cobro. Se deja constancia.
      if (item.notfound_qty > 0) {
        metaPeso.unshift({
          key: "NO ENTREGADO",
          value: `${item.notfound_qty} de ${item.requested_qty} sin existencias`,
        });
      }

      resumen.pesables += 1;
      lineItems.push({
        id: item.line_id,
        quantity: item.picked_qty,
        total: nuevoTotal.toFixed(2),
        subtotal: nuevoTotal.toFixed(2),
        meta_data: metaPeso,
      });
    } else if (targetQty === 0) {
      // Sustitución total o retiro del admin → la línea sale del pedido.
      resumen.eliminados += 1;
      lineItems.push({ id: item.line_id, quantity: 0 });
    } else if (item.notfound_qty > 0) {
      const cobro = item.original_price * item.picked_qty;
      resumen.no_entregados += 1;
      lineItems.push({
        id: item.line_id,
        quantity: targetQty,
        total: cobro.toFixed(2),
        subtotal: cobro.toFixed(2),
        meta_data: [
          {
            key: "NO ENTREGADO",
            value: `${item.notfound_qty} de ${item.requested_qty} sin existencias`,
          },
          { key: "_picking_adjusted", value: "true" },
        ],
      });
    } else if (targetQty !== item.requested_qty) {
      // Sustitución parcial → solo se descuentan las unidades sustituidas.
      lineItems.push({ id: item.line_id, quantity: targetQty });
    }
  }

  // D. Sustitutos.
  const consolidatedSubs = {};
  itemsToAdd.forEach((sub) => {
    if (!consolidatedSubs[sub.product_id]) {
      consolidatedSubs[sub.product_id] = { qty: 0, price: sub.price };
    }
    consolidatedSubs[sub.product_id].qty += sub.qty;
  });

  for (const [subId, info] of Object.entries(consolidatedSubs)) {
    const subKey = resolveKey(parseInt(subId, 10));
    const lineaExistente = subKey ? productMap[subKey] : null;

    if (lineaExistente) {
      // El sustituto YA está en el pedido: se suma a su línea en vez de
      // crear una segunda, que le duplicaba el producto al cliente.
      const yaEnPayload = lineItems.find((l) => l.id === lineaExistente.line_id);
      const baseQty = Math.max(
        0,
        lineaExistente.requested_qty - lineaExistente.subbed_qty,
      );
      const nuevaQty = (yaEnPayload ? yaEnPayload.quantity : baseQty) + info.qty;

      resumen.sustitutos_fusionados += 1;
      if (yaEnPayload) {
        yaEnPayload.quantity = nuevaQty;
        // El total se había calculado para la cantidad anterior: se borra
        // para que Woo recotice con el precio de la línea.
        delete yaEnPayload.total;
        delete yaEnPayload.subtotal;
      } else {
        lineItems.push({ id: lineaExistente.line_id, quantity: nuevaQty });
      }
      continue;
    }

    // Producto nuevo en el pedido: se agrega con el precio que se le prometió
    // al cliente. Antes `precio_nuevo` se leía del log y se descartaba, así
    // que Woo recotizaba a precio de catálogo.
    const nuevaLinea = { product_id: parseInt(subId, 10), quantity: info.qty };
    const precioSub = parseFloat(info.price || 0);
    if (precioSub > 0) {
      const totalSub = (precioSub * info.qty).toFixed(2);
      nuevaLinea.total = totalSub;
      nuevaLinea.subtotal = totalSub;
    }
    resumen.sustitutos_nuevos += 1;
    lineItems.push(nuevaLinea);
  }

  return { lineItems, resumen };
}

module.exports = { buildLineItemsPayload };
