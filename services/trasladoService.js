/**
 * TRASLADO SERVICE
 *
 * Lógica pura del traslado de pedidos WooCommerce entre sedes (WordPress Multisite).
 * Sin red ni DB: las dependencias externas se inyectan (p.ej. fetchProducts),
 * lo que permite testear todo con vitest sin mocks de cliente Woo.
 *
 * Flujo que soporta (orquestado por controllers/trasladoController.js, Phase 2):
 *   validar → pre-chequeo de stock → clon con precios de ORIGEN → copiar notas
 *   filtradas → cancelar origen → registrar en wc_pedidos_trasladados → audit.
 *
 * Decisiones de negocio (ver design.md):
 *   - ADR-1: precios de línea FORZADOS de origen (el cliente ya pagó ese total).
 *   - ADR-5: warnings de stock NO bloqueantes (persistidos en la tabla).
 *   - `_mkh_transferred_from` = `{sedeOrigen.nombre} (pedido #{orderIdOrigen})`
 *     (resolución de sdd-tasks Risk 1 sobre el formato del meta en el clon).
 *   - `customer_id` del clon se resuelve por EMAIL en la sede destino
 *     (resolveCustomerDestino): si el cliente existe → su id; si no → invitado
 *     (0). En Multisite cada sub-sitio tiene clientes independientes, así que
 *     el customer_id del ORIGEN no es válido en destino.
 */

// ============================================================
// CONSTANTES
// ============================================================

// Metas de LÍNEA que se copian al clon (las demás son ruido interno de plugins).
const LINE_ITEM_META_KEYS = [
  "pa_unidad-de-medida-aproximado",
  "pa_presentacion",
  "Nota de preparación",
  "_wcfx_item_note",
];

// Metas de PEDIDO copiadas del origen (plugin COD + facturación).
const ORDER_META_KEYS_ORIGEN = [
  "_billing_cod_payment_mode",
  "_billing_document",
  "_billing_person_type",
];

// Notas de pedido AUTOGENERADAS por WooCommerce que NO se copian al clon.
// Variantes ES/EN; el match es por contenido (no solo prefijo) para cubrir
// prefijos reales como "Email sent to..." / "Niveles de inventario reducidos:".
const NOTAS_AUTOGENERADAS = [
  "niveles de inventario reducidos", // ES — reducción de stock
  "stock levels reduced", // EN
  "email sent", // EN — avisos de emails del sistema
  "email enviado", // ES
  "pedido actualizado", // ES
  "order updated", // EN
  "estado del pedido cambiado", // ES
  "order status changed", // EN
  "pagos que se harán", // ES — recordatorio de pagos (COD)
  "payments to be made", // EN
  "mantenimiento en inventario", // ES
];

// ============================================================
// VALIDACIÓN DE REQUEST
// ============================================================

/**
 * Valida el body de los endpoints de traslado (validar y ejecutar).
 * @param {Object} body - Request body ({ order_id, sede_destino_id, motivo, admin_name, ... })
 * @returns {string[]} Lista de errores (vacía si todo está OK).
 */
function validateTrasladoRequest(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return [
      "Falta order_id",
      "Falta sede_destino_id",
      "El motivo es obligatorio",
      "El nombre del admin es obligatorio",
    ];
  }
  if (!body.order_id) errors.push("Falta order_id");
  if (!body.sede_destino_id) errors.push("Falta sede_destino_id");
  if (!body.motivo || !String(body.motivo).trim())
    errors.push("El motivo es obligatorio");
  if (!body.admin_name || !String(body.admin_name).trim())
    errors.push("El nombre del admin es obligatorio");
  return errors;
}

// ============================================================
// COMPARACIÓN DE SEDES
// ============================================================

/**
 * Determina si dos sedes son la misma (UUIDs se comparan case-insensitive).
 */
function isSameSede(sedeOrigenId, sedeDestinoId) {
  if (!sedeOrigenId || !sedeDestinoId) return false;
  return String(sedeOrigenId).toLowerCase() === String(sedeDestinoId).toLowerCase();
}

// ============================================================
// RESUMEN PARA LA UI (paso 1 del modal)
// ============================================================

/**
 * Resumen legible del pedido origen para mostrar antes de confirmar el traslado.
 * @returns {{ cliente: string, items: number, total: string, payment_method: string|null }}
 */
function summarizeOrder(order) {
  if (!order) return null;
  const billing = order.billing || {};
  const cliente = [billing.first_name, billing.last_name]
    .map((n) => (n || "").trim())
    .filter(Boolean)
    .join(" ");
  return {
    cliente: cliente || "Cliente sin nombre",
    items: Array.isArray(order.line_items) ? order.line_items.length : 0,
    total: order.total || "0",
    payment_method: order.payment_method || null,
  };
}

// ============================================================
// METAS DE LÍNEA Y DE PEDIDO
// ============================================================

/**
 * Filtra las metas de una línea del pedido origen: SOLO se copian las 4 keys
 * de preparación (unidad de medida, presentación, nota de preparación y nota
 * del plugin WCFX). Todo lo demás (precios por línea, plugins de envío, etc.)
 * NO viaja al clon.
 * @returns {Array<{ key: string, value: * }>}
 */
function filterOrderMetaData(metaData) {
  if (!Array.isArray(metaData)) return [];
  return metaData
    .filter((m) => m && LINE_ITEM_META_KEYS.includes(m.key))
    .map((m) => ({ key: m.key, value: m.value }));
}

/**
 * Construye las metas de PEDIDO del clon:
 *   - `_billing_cod_payment_mode` / `_billing_document` / `_billing_person_type`
 *     copiadas del origen (facturación COD ya registrada).
 *   - `_mkh_lite_branch_name` = sede DESTINO (meta canónica que el webhook del
 *     destino usa para detectar la sede del clon).
 *   - `_mkh_transferred_from` = `{sedeOrigen.nombre} (pedido #{orderIdOrigen})`
 *     (trazabilidad del clon).
 * @param {Object} params
 * @param {Object} params.order - Pedido origen (con su meta_data).
 * @param {Object} [params.sedeOrigen] - Sede origen (usa .nombre / .slug).
 * @param {Object} params.sedeDestino - Sede destino (usa .woo_meta_match.meta_value / .slug).
 * @param {number|string} params.orderIdOrigen - ID del pedido origen.
 * @returns {Array<{ key: string, value: * }>}
 */
function buildOrderMetaData({ order, sedeOrigen, sedeDestino, orderIdOrigen }) {
  const origenMeta = (Array.isArray(order && order.meta_data) ? order.meta_data : []).filter(
    (m) => m && m.value !== undefined && m.value !== null && String(m.value).trim() !== "",
  );
  const copiarDeOrigen = (key) => {
    const found = origenMeta.find((m) => m.key === key);
    return found ? found.value : undefined;
  };

  const meta = [];
  const push = (key, value) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      meta.push({ key, value });
    }
  };

  ORDER_META_KEYS_ORIGEN.forEach((key) => push(key, copiarDeOrigen(key)));

  const branch =
    (sedeDestino && sedeDestino.woo_meta_match && sedeDestino.woo_meta_match.meta_value) ||
    (sedeDestino && sedeDestino.slug) ||
    null;
  push("_mkh_lite_branch_name", branch);

  const nombreOrigen =
    (sedeOrigen && (sedeOrigen.nombre || sedeOrigen.slug)) || "sede desconocida";
  push("_mkh_transferred_from", `${nombreOrigen} (pedido #${orderIdOrigen})`);

  return meta;
}

// ============================================================
// NOTA DE CLIENTE DEL CLON
// ============================================================

/**
 * Arma la customer_note del clon: preserva la nota original del cliente
 * (si existe) y le agrega un bloque que documenta el traslado.
 */
function buildCustomerNote({ customerNote, adminName, motivo, sedeOrigenNombre, orderIdOrigen }) {
  const notaBase = (customerNote || "").trim();
  const motivoPart = (motivo || "").trim();
  const admin = (adminName || "admin").trim();
  const origen = sedeOrigenNombre || "otra sede";
  const traslado = [
    `Este pedido fue trasladado desde ${origen} (pedido original #${orderIdOrigen}) por ${admin}.`,
    motivoPart ? `Motivo: ${motivoPart}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return notaBase ? `${notaBase}\n\n${traslado}` : traslado;
}

/**
 * Resuelve el `customer_id` del clon en la sede destino.
 *
 * En WooCommerce Multisite cada sub-sitio tiene clientes independientes: el
 * customer_id del ORIGEN no existe (o apunta a otro usuario) en el destino.
 * Regla (hotfix post-verify):
 *   - Si hay email de facturación y existe un cliente con ese email en destino
 *     → se usa su id (el pedido queda vinculado al perfil, sin duplicados).
 *   - Si no hay email o el cliente no existe → invitado (`customer_id: 0`).
 *
 * `fetchCustomerByEmail(email)` está inyectado para testear sin red.
 *
 * @param {Object} params
 * @param {Object} params.order - Pedido origen (usa `billing.email`).
 * @param {Function} params.fetchCustomerByEmail - async (email) => Array
 * @returns {Promise<number>} customer_id a usar en el clon.
 */
async function resolveCustomerDestino({ order, fetchCustomerByEmail }) {
  const email = String((order && order.billing && order.billing.email) || "")
    .trim()
    .toLowerCase();
  if (!email || typeof fetchCustomerByEmail !== "function") return 0;

  try {
    const found = await fetchCustomerByEmail(email);
    if (Array.isArray(found) && found.length > 0 && found[0] && found[0].id) {
      return found[0].id;
    }
  } catch (error) {
    console.warn("[traslado] Error consultando cliente en destino:", error.message);
  }
  return 0;
}

// ============================================================
// PAYLOAD DE CLONADO
// ============================================================

/**
 * Construye el payload POST /orders del clon en la sede destino.
 * Reglas (design ADR-1):
 *   - Precios de línea FORZADOS de origen (`price` unitario + `total` por línea).
 *   - `total_tax` 0, `payment_method` cod, status processing.
 *   - Metas de línea filtradas (solo las 4 de preparación) y metas de pedido
 *     con branch destino + `_mkh_transferred_from`.
 *   - Billing/shipping completos del origen y shipping_lines con sus totales.
 *   - `customer_id`: si viene `customerId` (resuelto por email en el destino)
 *     se usa ese; si no, por compatibilidad se usa el del origen o invitado (0).
 */
function buildClonePayload({ order, sedeOrigen, sedeDestino, adminName, motivo, orderIdOrigen, customerId }) {
  const lineItems = (order.line_items || []).map((item) => ({
    product_id: item.product_id,
    variation_id: item.variation_id || 0,
    quantity: item.quantity,
    price: item.price,
    total: item.total,
    meta_data: filterOrderMetaData(item.meta_data),
  }));

  const shippingLines = (order.shipping_lines || []).map((shipping) => ({
    method_id: shipping.method_id,
    method_title: shipping.method_title,
    total: shipping.total || "0",
  }));

  return {
    status: "processing",
    payment_method: "cod",
    payment_method_title: order.payment_method_title || null,
    customer_id: customerId !== undefined ? customerId : order.customer_id || 0,
    customer_note: buildCustomerNote({
      customerNote: order.customer_note,
      adminName,
      motivo,
      sedeOrigenNombre: sedeOrigen && (sedeOrigen.nombre || sedeOrigen.slug),
      orderIdOrigen,
    }),
    billing: order.billing || {},
    shipping: order.shipping || {},
    line_items: lineItems,
    shipping_lines: shippingLines,
    total_tax: "0",
    meta_data: buildOrderMetaData({ order, sedeOrigen, sedeDestino, orderIdOrigen }),
  };
}

// ============================================================
// FILTRADO DE NOTAS DE PEDIDO
// ============================================================

/**
 * Filtra las notas del pedido origen para copiarlas al clon:
 *   - Descarta autor `system` (notas internas de WooCommerce).
 *   - Descarta notas autogeneradas conocidas (ES/EN): reducción de inventario,
 *     emails del sistema, actualización/estado del pedido, pagos por hacer,
 *     mantenimiento de inventario.
 *   - PRESERVA siempre las notas con `customer_note: true` (notas del cliente).
 * @param {Array} notes - Notas del pedido (GET /orders/{id}/notes).
 * @returns {Array} Notas que sí se copian al clon.
 */
function filterOrderNotes(notes) {
  if (!Array.isArray(notes)) return [];
  return notes.filter((note) => {
    if (!note || !note.note) return false;

    // Las notas del cliente SIEMPRE se preservan (visible para el cliente).
    if (note.customer_note === true) return true;

    const autor =
      typeof note.author === "object" && note.author ? note.author.name : note.author;
    if (autor && String(autor).toLowerCase() === "system") return false;

    const texto = String(note.note).toLowerCase().replace(/\s+/g, " ").trim();
    if (!texto) return false;
    return !NOTAS_AUTOGENERADAS.some((f) => texto.includes(f));
  });
}

// ============================================================
// PRE-CHEQUEO DE STOCK EN LA SEDE DESTINO
// ============================================================

// Clasificación por línea (spec R2):
//   - producto/variación ausente en destino            → item_missing
//   - sin manage_stock o stock_quantity <= 0           → stock_unavailable
//   - 0 < stock_quantity < cantidad pedida             → stock_insufficient
function clasificarLinea({ item, found, warnings }) {
  const warning = (tipo, stock) =>
    warnings.push({
      tipo,
      product_id: item.product_id,
      variation_id: item.variation_id || 0,
      nombre: item.name || `Producto #${item.product_id}`,
      stock: stock === undefined || stock === null ? null : Number(stock),
      qty: item.quantity,
    });

  if (!found) return warning("item_missing", null);

  const qty = Number(item.quantity) || 0;
  if (!found.manage_stock) {
    // Spec R2: sin manage_stock en destino → no hay stock verificable → warning.
    return warning("stock_unavailable", null);
  }
  const stock = Number(found.stock_quantity);
  if (stock <= 0) return warning("stock_unavailable", stock);
  if (stock < qty) return warning("stock_insufficient", stock);
  return undefined; // stock suficiente → sin warning
}

/**
 * Pre-chequea el stock de la sede destino por línea (warnings NO bloqueantes,
 * ADR-5). `fetchProducts(endpoint, params)` está inyectado para testear sin red:
 *   - simples:      products?include=...&_fields=id,manage_stock,stock_quantity,stock_status,name
 *   - variaciones:  products/{parentId}/variations?include=...&_fields=id,manage_stock,stock_quantity
 *
 * Si una consulta falla (error de red/API), NO se inventan warnings para ese grupo:
 * es preferible silenciar a marcar todo como item_missing por error.
 *
 * @param {Object} params
 * @param {Array} params.lineItems - line_items del pedido origen.
 * @param {Function} params.fetchProducts - async (endpoint, params) => Promise<Array>
 * @returns {Promise<Array>} warnings: [{ tipo, product_id, variation_id, nombre, stock, qty }]
 */
async function checkStockDestino({ lineItems, fetchProducts }) {
  if (!Array.isArray(lineItems) || lineItems.length === 0 || typeof fetchProducts !== "function") {
    return [];
  }

  const warnings = [];
  const simples = [];
  const variacionesPorPadre = new Map();

  for (const item of lineItems) {
    const variationId = item.variation_id || 0;
    if (variationId) {
      if (!variacionesPorPadre.has(item.product_id)) {
        variacionesPorPadre.set(item.product_id, []);
      }
      variacionesPorPadre.get(item.product_id).push({ item, variationId });
    } else {
      simples.push(item);
    }
  }

  // ---- Productos simples: una sola consulta con include ----
  if (simples.length > 0) {
    const ids = simples.map((i) => i.product_id);
    let products = [];
    let errorDeConsulta = false;
    try {
      products = await fetchProducts("products", {
        include: ids,
        per_page: 100,
        _fields: "id,manage_stock,stock_quantity,stock_status,name",
      });
    } catch (error) {
      errorDeConsulta = true;
      console.warn("[traslado] Error consultando stock de simples:", error.message);
    }
    if (!errorDeConsulta) {
      for (const item of simples) {
        const found = Array.isArray(products)
          ? products.find((p) => p && p.id === item.product_id)
          : undefined;
        clasificarLinea({ item, found, warnings });
      }
    }
  }

  // ---- Variaciones: una consulta por producto padre ----
  for (const [parentId, variaciones] of variacionesPorPadre) {
    const ids = variaciones.map((v) => v.variationId);
    let foundItems = [];
    let errorDeConsulta = false;
    try {
      foundItems = await fetchProducts(`products/${parentId}/variations`, {
        include: ids,
        per_page: 100,
        _fields: "id,manage_stock,stock_quantity",
      });
    } catch (error) {
      errorDeConsulta = true;
      console.warn(
        `[traslado] Error consultando stock de variaciones del producto ${parentId}:`,
        error.message,
      );
    }
    if (!errorDeConsulta) {
      for (const { item, variationId } of variaciones) {
        const found = Array.isArray(foundItems)
          ? foundItems.find((v) => v && v.id === variationId)
          : undefined;
        clasificarLinea({ item, found, warnings });
      }
    }
  }

  return warnings;
}

module.exports = {
  validateTrasladoRequest,
  isSameSede,
  summarizeOrder,
  filterOrderMetaData,
  buildOrderMetaData,
  buildCustomerNote,
  buildClonePayload,
  filterOrderNotes,
  checkStockDestino,
  resolveCustomerDestino,
};
