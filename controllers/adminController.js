const { supabase } = require("../services/supabaseClient");
const {
  getWooClient,
  invalidateResponseCache,
} = require("../services/wooMultiService");
const { logAuditEvent } = require("../services/auditService");

// Helper: Obtener sede_id de una sesión
async function getSessionSedeId(sessionId) {
  const { data } = await supabase
    .from("wc_picking_sessions")
    .select("sede_id")
    .eq("id", sessionId)
    .single();
  return data?.sede_id || null;
}

// Helper: Buscar el mejor código de barras desde SIESA para un SKU
async function getBarcodeFromSiesa(sku) {
  try {
    const f120Id = parseInt(sku);
    if (isNaN(f120Id)) return null;

    const { data: barcodes } = await supabase
      .from("siesa_codigos_barras")
      .select("codigo_barras")
      .eq("f120_id", f120Id);

    if (!barcodes || barcodes.length === 0) return null;

    const validCodes = barcodes
      .map((bc) => (bc.codigo_barras || "").toString().trim())
      .filter((cleaned) => {
        const stripped = cleaned.replace(/\+$/, "");
        if (!stripped || stripped.length < 4) return false;
        if (/^[MN]\d/i.test(stripped)) return false;
        return /^\d+([A-Z]*\d*)?\+?$/i.test(cleaned);
      });

    const ean13 = validCodes.find((c) => c.replace(/\+$/, "").length === 13);
    return ean13 || validCodes[0] || null;
  } catch (e) {
    console.error("Error buscando barcode SIESA para SKU", sku, e.message);
    return null;
  }
}

exports.removeItemFromSession = async (req, res) => {
  const { id_sesion, id_producto, admin_name, admin_email } = req.body;

  try {
    const now = new Date().toISOString();

    const { data: session } = await supabase
      .from("wc_picking_sessions")
      .select("snapshot_pedidos, ids_pedidos")
      .eq("id", id_sesion)
      .single();
    if (!session) throw new Error("Sesión no encontrada");

    // SOFT DELETE: Marcar is_removed = true
    let productoEncontrado = false;
    let nombreProducto = "Producto";

    const nuevoSnapshot = session.snapshot_pedidos.map((pedido) => {
      const nuevosItems = pedido.line_items.map((item) => {
        // Comparar contra variation_id (para variaciones) o product_id
        const effectiveId = item.variation_id || item.product_id;
        if (effectiveId === id_producto || item.product_id === id_producto) {
          productoEncontrado = true;
          nombreProducto = item.name;
          return {
            ...item,
            is_removed: true,
            removal_reason: "admin_decision",
            removed_at: now,
          };
        }
        return item;
      });
      return { ...pedido, line_items: nuevosItems };
    });

    const { error: updateError } = await supabase
      .from("wc_picking_sessions")
      .update({ snapshot_pedidos: nuevoSnapshot })
      .eq("id", id_sesion);
    if (updateError) throw updateError;

    // LOG DE AUDITORÍA (eliminado_admin)
    const { data: anyAssign } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, id_pedido")
      .eq("id_sesion", id_sesion)
      .limit(1)
      .maybeSingle();
    const sedeId = await getSessionSedeId(id_sesion);

    const logEntry = {
      id_asignacion: anyAssign ? anyAssign.id : null,
      id_pedido: anyAssign ? anyAssign.id_pedido : null,
      id_producto: id_producto,
      nombre_producto: nombreProducto,
      fecha_registro: now,
      accion: "eliminado_admin",
      es_sustituto: false,
      motivo: "Decisión del cliente/admin en vivo",
      sede_id: sedeId, // ✅ MULTI-SEDE
    };

    await supabase.from("wc_log_picking").insert([logEntry]);

    logAuditEvent({
      actor: {
        type: "admin",
        id: admin_email || null,
        name: (admin_name || "").trim() || "Admin",
      },
      action: "item.removed",
      entity: { type: "session", id: id_sesion },
      sedeId,
      metadata: {
        id_producto,
        nombre_producto: nombreProducto,
      },
    });

    res.status(200).json({ message: "Producto anulado correctamente." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ NUEVA FUNCIÓN: RESTAURAR ITEM
exports.restoreItemToSession = async (req, res) => {
  const { id_sesion, id_producto, admin_name, admin_email } = req.body;

  try {
    const now = new Date().toISOString();

    const { data: session } = await supabase
      .from("wc_picking_sessions")
      .select("snapshot_pedidos")
      .eq("id", id_sesion)
      .single();
    if (!session) throw new Error("Sesión no encontrada");

    // REVERTIR SOFT DELETE
    const nuevoSnapshot = session.snapshot_pedidos.map((pedido) => {
      const nuevosItems = pedido.line_items.map((item) => {
        // Comparar contra variation_id (para variaciones) o product_id
        const effectiveId = item.variation_id || item.product_id;
        if (effectiveId === id_producto || item.product_id === id_producto) {
          // Quitamos la bandera is_removed
          return { ...item, is_removed: false, restored_at: now };
        }
        return item;
      });
      return { ...pedido, line_items: nuevosItems };
    });

    const { error: updateError } = await supabase
      .from("wc_picking_sessions")
      .update({ snapshot_pedidos: nuevoSnapshot })
      .eq("id", id_sesion);
    if (updateError) throw updateError;

    // LOG DE AUDITORÍA (restaurado_admin)
    const { data: anyAssign } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, id_pedido")
      .eq("id_sesion", id_sesion)
      .limit(1)
      .maybeSingle();
    const sedeIdRestore = await getSessionSedeId(id_sesion);

    const logEntry = {
      id_asignacion: anyAssign ? anyAssign.id : null,
      id_pedido: anyAssign ? anyAssign.id_pedido : null,
      id_producto: id_producto,
      nombre_producto: "Item Restaurado", // Opcional buscar nombre real
      fecha_registro: now,
      accion: "restaurado_admin",
      es_sustituto: false,
      motivo: "Restauración administrativa",
      sede_id: sedeIdRestore, // ✅ MULTI-SEDE
    };

    await supabase.from("wc_log_picking").insert([logEntry]);

    logAuditEvent({
      actor: {
        type: "admin",
        id: admin_email || null,
        name: (admin_name || "").trim() || "Admin",
      },
      action: "item.restored",
      entity: { type: "session", id: id_sesion },
      sedeId: sedeIdRestore,
      metadata: { id_producto },
    });

    res.status(200).json({ message: "Producto restaurado correctamente." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
// ✅ NUEVA FUNCIÓN: PASAR A CANASTA (FORZADO POR ADMIN)
exports.forcePickItemToSession = async (req, res) => {
  const { id_sesion, id_producto, admin_name, admin_email } = req.body;

  try {
    const now = new Date().toISOString();

    // 1. Obtener todas las asignaciones (pedidos) de esta sesión
    const { data: assignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, id_pedido, reporte_snapshot")
      .eq("id_sesion", id_sesion);

    if (!assignments || assignments.length === 0) {
      throw new Error("Asignaciones no encontradas");
    }

    // Multi-Sede: Obtener sede de la sesión
    const sedeIdForce = await getSessionSedeId(id_sesion);

    // 2. Traer logs actuales para saber cuántos faltan
    const { data: currentLogs } = await supabase
      .from("wc_log_picking")
      .select("id_pedido, accion")
      .eq("id_producto_original", id_producto)
      .in(
        "id_asignacion",
        assignments.map((a) => a.id),
      );

    const logsToInsert = [];

    // 2.5 Buscar código de barras real desde SIESA para el producto
    let resolvedBarcode = null;

    // 3. Revisar cada pedido y agregar lo que falte
    for (let assign of assignments) {
      const items = assign.reporte_snapshot?.line_items || [];
      // Buscar el producto en este pedido
      const foundItem = items.find(
        (i) => i.product_id === id_producto || i.variation_id === id_producto,
      );

      if (foundItem) {
        // Buscar barcode SIESA solo una vez (el SKU es el mismo para el mismo producto)
        if (resolvedBarcode === null && foundItem.sku) {
          resolvedBarcode = await getBarcodeFromSiesa(foundItem.sku);
          if (!resolvedBarcode) {
            console.warn(
              `⚠️ Admin force-pick: No se encontró barcode SIESA para SKU ${foundItem.sku} (producto ${id_producto})`,
            );
          }
        }

        const requiredQty = foundItem.quantity;

        // Contar cuántos ya están listos en este pedido
        const pickedQty = currentLogs.filter(
          (l) =>
            l.id_pedido === assign.id_pedido &&
            ["recolectado", "sustituido", "no_encontrado"].includes(l.accion),
        ).length;

        const missingQty = requiredQty - pickedQty;

        // Crear un log por cada unidad que falta
        for (let i = 0; i < missingQty; i++) {
          logsToInsert.push({
            id_asignacion: assign.id,
            id_pedido: assign.id_pedido,
            id_producto: id_producto,
            id_producto_original: id_producto,
            nombre_producto: foundItem.name,
            accion: "recolectado",
            fecha_registro: now,
            motivo: "Aprobado manualmente por Admin en Dashboard",
            pasillo: "Admin",
            codigo_barras_escaneado: resolvedBarcode || null, // Solo código de barras SIESA, nunca SKU
            sede_id: sedeIdForce, // ✅ MULTI-SEDE
          });
        }
      }
    }

    // Insertar a la base de datos
    if (logsToInsert.length > 0) {
      // 🛡️ GUARD: Re-verificar cantidad justo antes de insertar (anti-race-condition)
      // Si entre el cálculo de missingQty y este punto otro request insertó logs,
      // recalculamos para no exceder la cantidad del pedido.
      const { data: freshLogs } = await supabase
        .from("wc_log_picking")
        .select("id_pedido, accion")
        .eq("id_producto_original", id_producto)
        .in(
          "id_asignacion",
          assignments.map((a) => a.id),
        )
        .in("accion", ["recolectado", "sustituido", "no_encontrado"]);

      const freshPickedByOrder = {};
      (freshLogs || []).forEach((l) => {
        freshPickedByOrder[l.id_pedido] =
          (freshPickedByOrder[l.id_pedido] || 0) + 1;
      });

      // Filtrar logs que ya no son necesarios
      const safeLogsToInsert = logsToInsert.filter((log) => {
        const assign = assignments.find((a) => a.id === log.id_asignacion);
        if (!assign) return false;
        const items = assign.reporte_snapshot?.line_items || [];
        const foundItem = items.find(
          (i) => i.product_id === id_producto || i.variation_id === id_producto,
        );
        if (!foundItem) return false;
        const currentPicked = freshPickedByOrder[log.id_pedido] || 0;
        if (currentPicked >= foundItem.quantity) return false;
        freshPickedByOrder[log.id_pedido] = currentPicked + 1;
        return true;
      });

      if (safeLogsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("wc_log_picking")
          .insert(safeLogsToInsert);
        if (insertError) throw insertError;
      }
    }

    logAuditEvent({
      actor: {
        type: "admin",
        id: admin_email || null,
        name: (admin_name || "").trim() || "Admin",
      },
      action: "item.force_picked",
      entity: { type: "session", id: id_sesion },
      sedeId: sedeIdForce,
      metadata: { id_producto, cantidad: logsToInsert.length },
    });

    res
      .status(200)
      .json({ message: "Producto enviado a canasta correctamente." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// =========================================================
// CANCELAR PEDIDO COMPLETO (cambiar status en WooCommerce + registro en Supabase)
// =========================================================
exports.cancelOrder = async (req, res) => {
  const { order_id, motivo, admin_name, admin_email, sede_id } = req.body;

  try {
    if (!order_id) return res.status(400).json({ error: "Falta order_id" });
    if (!motivo || !motivo.trim())
      return res.status(400).json({ error: "El motivo es obligatorio" });
    if (!admin_name || !admin_name.trim())
      return res
        .status(400)
        .json({ error: "El nombre del admin es obligatorio" });

    // 1. Verificar que el pedido NO esté en una sesión de picking activa
    const { data: activeAssignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, id_sesion, wc_picking_sessions!inner(estado)")
      .eq("id_pedido", order_id)
      .not(
        "wc_picking_sessions.estado",
        "in",
        '("cancelado","finalizado","auditado")',
      );

    if (activeAssignments && activeAssignments.length > 0) {
      return res.status(409).json({
        error:
          "Este pedido está en una sesión de picking activa. Finalice o cancele la sesión primero.",
      });
    }

    // 2. Verificar que no esté ya cancelado en nuestra tabla
    const { data: existing } = await supabase
      .from("wc_pedidos_cancelados")
      .select("id")
      .eq("order_id", order_id)
      .is("restored_at", null)
      .maybeSingle();

    if (existing) {
      return res
        .status(409)
        .json({ error: "Este pedido ya fue cancelado previamente." });
    }

    // 3. Obtener datos completos del pedido desde WooCommerce antes de cancelar
    const effectiveSedeId = sede_id || req.sedeId;
    const wooClient = await getWooClient(effectiveSedeId);
    const { data: orderData } = await wooClient.get(`orders/${order_id}`);

    if (!orderData) {
      return res
        .status(404)
        .json({ error: "Pedido no encontrado en WooCommerce." });
    }

    // 4. Cambiar status en WooCommerce a "cancelled"
    await wooClient.put(`orders/${order_id}`, { status: "cancelled" });

    // 5. Guardar snapshot completo en Supabase
    const { error: insertError } = await supabase
      .from("wc_pedidos_cancelados")
      .insert([
        {
          order_id: order_id,
          order_data: orderData,
          motivo: motivo.trim(),
          admin_name: admin_name.trim(),
          admin_email: admin_email || null,
          sede_id: effectiveSedeId || null,
        },
      ]);

    if (insertError) throw insertError;

    // 6. Invalidar caché para que el pedido desaparezca inmediatamente
    invalidateResponseCache();

    console.log(
      `🗑️ [ADMIN] Pedido #${order_id} cancelado por ${admin_name} — Motivo: ${motivo}`,
    );

    logAuditEvent({
      actor: {
        type: "admin",
        id: admin_email || null,
        name: admin_name.trim(),
      },
      action: "order.cancelled",
      entity: { type: "order", id: order_id },
      sedeId: effectiveSedeId || null,
      metadata: { motivo: motivo.trim() },
    });

    res.status(200).json({
      message: `Pedido #${order_id} cancelado correctamente.`,
      order_id,
    });
  } catch (error) {
    console.error("Error cancelando pedido:", error.message);
    res
      .status(500)
      .json({ error: `Error al cancelar pedido: ${error.message}` });
  }
};

// =========================================================
// RESTAURAR PEDIDO CANCELADO (volver a processing en WooCommerce)
// =========================================================
exports.restoreOrder = async (req, res) => {
  const { cancel_record_id, admin_name } = req.body;

  try {
    if (!cancel_record_id)
      return res.status(400).json({ error: "Falta cancel_record_id" });
    if (!admin_name || !admin_name.trim())
      return res
        .status(400)
        .json({ error: "El nombre del admin es obligatorio" });

    // 1. Buscar el registro de cancelación
    const { data: record, error: findError } = await supabase
      .from("wc_pedidos_cancelados")
      .select("*")
      .eq("id", cancel_record_id)
      .is("restored_at", null)
      .single();

    if (findError || !record) {
      return res.status(404).json({
        error: "Registro de cancelación no encontrado o ya fue restaurado.",
      });
    }

    // 2. Restaurar en WooCommerce
    const effectiveSedeId = record.sede_id || req.sedeId;
    const wooClient = await getWooClient(effectiveSedeId);
    await wooClient.put(`orders/${record.order_id}`, { status: "processing" });

    // 3. Marcar como restaurado en Supabase
    const { error: updateError } = await supabase
      .from("wc_pedidos_cancelados")
      .update({
        restored_at: new Date().toISOString(),
        restored_by: admin_name.trim(),
      })
      .eq("id", cancel_record_id);

    if (updateError) throw updateError;

    // 4. Invalidar caché
    invalidateResponseCache();

    console.log(
      `♻️ [ADMIN] Pedido #${record.order_id} restaurado por ${admin_name}`,
    );

    logAuditEvent({
      actor: { type: "admin", id: null, name: admin_name.trim() },
      action: "order.restored",
      entity: { type: "order", id: record.order_id },
      sedeId: effectiveSedeId || null,
      metadata: { cancel_record_id: record.id },
    });

    res.status(200).json({
      message: `Pedido #${record.order_id} restaurado correctamente.`,
      order_id: record.order_id,
    });
  } catch (error) {
    console.error("Error restaurando pedido:", error.message);
    res
      .status(500)
      .json({ error: `Error al restaurar pedido: ${error.message}` });
  }
};

// =========================================================
// LISTAR PEDIDOS CANCELADOS
// =========================================================
exports.getCancelledOrders = async (req, res) => {
  try {
    let query = supabase
      .from("wc_pedidos_cancelados")
      .select("*")
      .is("restored_at", null)
      .order("cancelled_at", { ascending: false })
      .limit(100);

    if (req.sedeId) {
      query = query.eq("sede_id", req.sedeId);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json(data || []);
  } catch (error) {
    console.error("Error listando pedidos cancelados:", error.message);
    res
      .status(500)
      .json({ error: `Error al listar pedidos cancelados: ${error.message}` });
  }
};
