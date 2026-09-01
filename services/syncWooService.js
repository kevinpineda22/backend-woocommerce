const { getWooClient } = require("./wooMultiService");
const { supabase } = require("./supabaseClient");
const { buildLineItemsPayload } = require("../utils/wooLinePayload");

/**
 * Función Principal: Sincroniza los cambios físicos hacia WooCommerce.
 * Usa un SOLO PUT /orders/{id} con todas las modificaciones de line_items
 * en batch, que es la forma correcta de la API REST de WooCommerce v3.
 */
const syncOrderToWoo = async (sessionId, orderId) => {
  console.log(
    `🔄 [SYNC] Iniciando sincronización para Pedido #${orderId} (Sesión ${sessionId})`,
  );

  let activeClient;

  try {
    // 1. Obtener la Asignación interna (Para filtrar los logs correctos y obtener sede)
    const { data: assignment } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, sede_id")
      .eq("id_sesion", sessionId)
      .eq("id_pedido", orderId)
      .single();

    if (!assignment)
      throw new Error("No se encontró asignación para este pedido.");

    // 2. Instanciar Cliente WooCommerce Dinámico según Sede
    activeClient = await getWooClient(assignment.sede_id);

    // 3. Obtener el Pedido Original de Woo (Para tener precios base y IDs de línea)
    const { data: wooOrder } = await activeClient.get(`orders/${orderId}`);

    // 4. Obtener los Logs Reales (Lo que hizo el Picker)
    const { data: logs } = await supabase
      .from("wc_log_picking")
      .select("*")
      .eq("id_asignacion", assignment.id)
      .order("fecha_registro", { ascending: true });

    // 4b. Anulaciones del admin — se consultan a nivel de SESIÓN, no de pedido.
    // `removeItemFromSession` marca el producto como retirado en TODOS los
    // pedidos del snapshot pero deja un único log colgado de una asignación
    // cualquiera, así que filtrar por `assignment.id` lo perdería en el resto
    // de los pedidos de la sesión.
    const { data: sessionAssignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id")
      .eq("id_sesion", sessionId);

    const { data: adminRemovals } = await supabase
      .from("wc_log_picking")
      .select("id_producto")
      .in("id_asignacion", (sessionAssignments || []).map((a) => a.id))
      .eq("accion", "eliminado_admin");

    // --- ARMADO DEL PAYLOAD ---
    // Toda la decisión de qué se le cobra al cliente vive en
    // utils/wooLinePayload.js (puro, con tests). Acá solo queda la I/O.
    const { lineItems: lineItemsPayload, resumen } = buildLineItemsPayload({
      wooOrder,
      logs: logs || [],
      adminRemovals: adminRemovals || [],
    });

    console.log(
      `🧾 [SYNC] Pedido #${orderId}: ${resumen.pesables} pesable(s), ` +
        `${resumen.no_entregados} no entregado(s), ${resumen.eliminados} eliminado(s), ` +
        `${resumen.sustitutos_nuevos} sustituto(s) nuevo(s), ${resumen.sustitutos_fusionados} fusionado(s)`,
    );

    // 6. EJECUTAR PUT
    const updatePayload = {
      status: "completed",
    };

    if (lineItemsPayload.length > 0) {
      updatePayload.line_items = lineItemsPayload;
    }

    console.log(
      `📦 [SYNC] Enviando ${lineItemsPayload.length} cambios de líneas + status=completed para Pedido #${orderId}`,
    );
    await activeClient.put(`orders/${orderId}`, updatePayload);

    console.log(`✅ [OK] Pedido #${orderId} sincronizado exitosamente.`);
    return true;
  } catch (error) {
    console.error(
      `❌ [ERROR] Falló sync completo para pedido #${orderId}:`,
      error.message,
    );

    // FALLBACK
    try {
      if (activeClient) {
        console.log(
          `🔁 [FALLBACK] Intentando marcar solo status=completed para Pedido #${orderId}...`,
        );
        await activeClient.put(`orders/${orderId}`, {
          status: "completed",
        });
        console.log(
          `⚠️ [FALLBACK OK] Pedido #${orderId} marcado como completed (sin ajustes de líneas).`,
        );
        return true;
      }
    } catch (fallbackError) {
      console.error(
        `❌ [FALLBACK ERROR] No se pudo cambiar estado del pedido #${orderId}:`,
        fallbackError.message,
      );
    }
    return false;
  }
};

module.exports = { syncOrderToWoo };
