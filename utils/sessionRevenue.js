/**
 * Cálculo de recaudo por sesión — FUENTE ÚNICA DE VERDAD.
 *
 * Toda la plata del módulo ecommerce se calcula acá. Lo usan:
 *   - analyticsController.getIntelligenceCenter  (detalle por ventana)
 *   - analyticsController.getGlobalSummary       (total all-time, vía columnas)
 *   - refreshSessionSummary                       (pre-agregado por sesión)
 *   - scripts/backfill-session-summary.js         (relleno histórico)
 *
 * ⚠️ NO duplicar esta lógica en otro archivo. Si el criterio de recaudo cambia,
 * cambia acá y se re-corre el backfill. Un desync de plata ya cobró la mitad de
 * lo debido una vez (ver CLAUDE.md).
 */

const { supabase } = require("../services/supabaseClient");
const { calcLineCharge } = require("./manifestPricing");
const { resolvePaymentLabel, CREDITO_LABEL } = require("./paymentMethods");

// Etiquetas legibles por método de pago registrado.
const PAY_LABELS = {
  efectivo: "Efectivo",
  credito: CREDITO_LABEL,
  qr: "QR",
  datafono: "Datáfono",
};

// Resuelve método de pago de un pedido:
// 1. Prioridad: lo registrado individualmente en wc_asignaciones_pedidos (Fase 4).
// 2. Fallback: lo registrado en la sesión (modelo previo).
// 3. Fallback: lo que venía en el snapshot de WooCommerce.
function resolvePaymentMethod(session, snapshotOrder, assignment = null) {
  // A. Dato de la asignación individual (Fase 4): fuente de verdad.
  if (assignment?.metodo_pago && PAY_LABELS[assignment.metodo_pago]) {
    return PAY_LABELS[assignment.metodo_pago];
  }
  // B. Fallback a la sesión (sesiones antiguas o cierres globales).
  if (
    session?.metodo_pago &&
    PAY_LABELS[session.metodo_pago] &&
    session.metodo_pago !== "mixto"
  ) {
    return PAY_LABELS[session.metodo_pago];
  }
  // C. Fallback al snapshot de WooCommerce.
  return resolvePaymentLabel(snapshotOrder) || "Otros";
}

// Suma el total real de un pedido a partir de datos_salida (post-picking).
function orderRevenue(order) {
  if (!order) return 0;
  const items = (order.items || order.line_items || []).filter(
    (i) => !i.is_shipping_method && !i.is_removed,
  );
  const itemsTotal = items.reduce((s, it) => s + calcLineCharge(it), 0);
  const shipping = (order.shipping_lines || []).reduce(
    (s, x) => s + (parseFloat(x.total) || 0),
    0,
  );
  const calc = itemsTotal + shipping;
  const wooTotal = parseFloat(order.total) || 0;
  if (Math.abs(calc - wooTotal) > 1 && calc > 0) return calc;
  return wooTotal > 0 ? wooTotal : calc;
}

/**
 * Recaudo agregado de UNA sesión. Reproduce EXACTAMENTE el criterio financiero
 * de getIntelligenceCenter: cuenta un pedido solo si tiene recaudo > 0 y — si la
 * sesión está 'auditado' — solo si está efectivamente pagado. Una sesión
 * 'finalizado' / 'pendiente_auditoria' cuenta todos sus pedidos con recaudo.
 *
 * @param {Object} session  fila de wc_picking_sessions con: estado, metodo_pago,
 *   snapshot_pedidos, datos_salida, ids_pedidos y wc_asignaciones_pedidos[].
 * @returns {{ total_recaudado:number, orders_count:number, resumen_por_metodo:Object }}
 */
function computeSessionRevenue(session) {
  const orders =
    session.datos_salida?.orders ||
    session.snapshot_pedidos ||
    session.ids_pedidos?.map((id) => ({ id })) ||
    [];

  const asignacionesByPedido = new Map(
    (session.wc_asignaciones_pedidos || []).map((a) => [String(a.id_pedido), a]),
  );

  let total = 0;
  let count = 0;
  const byMethod = new Map();

  orders.forEach((order, idx) => {
    const orderId = String(order.id);
    const snapshot =
      (session.snapshot_pedidos || []).find((o) => String(o.id) === orderId) ||
      session.snapshot_pedidos?.[idx];

    const rev = orderRevenue(order) || orderRevenue(snapshot);
    if (rev <= 0) return;

    const assignment = asignacionesByPedido.get(orderId);
    const method = resolvePaymentMethod(session, snapshot || order, assignment);

    // En 'auditado' sin método confirmado, el pedido falta por cobrar: no suma.
    const isPaid = !!(
      assignment?.metodo_pago ||
      (session.metodo_pago && session.metodo_pago !== "mixto")
    );
    if (!isPaid && session.estado === "auditado") return;

    total += rev;
    count += 1;
    byMethod.set(method, (byMethod.get(method) || 0) + rev);
  });

  return {
    total_recaudado: Math.round(total),
    orders_count: count,
    resumen_por_metodo: Object.fromEntries(
      Array.from(byMethod, ([name, value]) => [name, Math.round(value)]),
    ),
  };
}

// Columnas resumen que sí forman parte del recaudo (excluye 'cancelado').
const REVENUE_STATES = ["finalizado", "auditado", "pendiente_auditoria"];

/**
 * Recalcula y persiste el recaudo pre-agregado de UNA sesión. Llamar al final de
 * cualquier handler que modifique estado / método de pago / datos_salida de una
 * sesión (auditar, marcar pago, cobrar cartera). Lee y escribe una sola fila:
 * barato, y deja el total all-time siempre exacto sin escanear JSONB en lectura.
 *
 * Nunca lanza hacia el handler que lo llama: un fallo del pre-agregado no debe
 * tumbar el cobro. Loguea y sigue; el backfill lo corrige después.
 *
 * @param {string|number} sessionId
 * @returns {Promise<Object|null>} el resumen escrito, o null si no se pudo.
 */
async function refreshSessionSummary(sessionId) {
  try {
    const { data: session, error } = await supabase
      .from("wc_picking_sessions")
      .select(
        "id, estado, metodo_pago, snapshot_pedidos, datos_salida, ids_pedidos, wc_asignaciones_pedidos(id_pedido, metodo_pago, fecha_pago, pagado_por)",
      )
      .eq("id", sessionId)
      .single();
    if (error) throw error;

    const summary = computeSessionRevenue(session);

    const { error: updErr } = await supabase
      .from("wc_picking_sessions")
      .update(summary)
      .eq("id", sessionId);
    if (updErr) throw updErr;

    return summary;
  } catch (err) {
    console.error(
      `refreshSessionSummary(${sessionId}) falló (no bloqueante):`,
      err.message,
    );
    return null;
  }
}

module.exports = {
  PAY_LABELS,
  REVENUE_STATES,
  resolvePaymentMethod,
  orderRevenue,
  computeSessionRevenue,
  refreshSessionSummary,
};
