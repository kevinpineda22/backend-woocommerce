const { supabase } = require("../services/supabaseClient");

exports.removeItemFromSession = async (req, res) => {
  const { id_sesion, id_producto } = req.body;

  try {
    const now = new Date().toISOString();

    const { data: session } = await supabase.from("wc_picking_sessions").select("snapshot_pedidos, ids_pedidos").eq("id", id_sesion).single();
    if (!session) throw new Error("Sesión no encontrada");

    // SOFT DELETE: Marcar is_removed = true
    let productoEncontrado = false;
    let nombreProducto = "Producto";

    const nuevoSnapshot = session.snapshot_pedidos.map(pedido => {
      const nuevosItems = pedido.line_items.map(item => {
        if (item.product_id === id_producto) {
            productoEncontrado = true;
            nombreProducto = item.name;
            return { ...item, is_removed: true, removal_reason: 'admin_decision', removed_at: now };
        }
        return item;
      });
      return { ...pedido, line_items: nuevosItems };
    });

    const { error: updateError } = await supabase.from("wc_picking_sessions").update({ snapshot_pedidos: nuevoSnapshot }).eq("id", id_sesion);
    if (updateError) throw updateError;

    // LOG DE AUDITORÍA (eliminado_admin)
    const { data: anyAssign } = await supabase.from("wc_asignaciones_pedidos").select("id, id_pedido").eq("id_sesion", id_sesion).limit(1).maybeSingle();

    const logEntry = {
        id_asignacion: anyAssign ? anyAssign.id : null,
        id_pedido: anyAssign ? anyAssign.id_pedido : null,
        id_producto: id_producto,
        nombre_producto: nombreProducto,
        fecha_registro: now,
        accion: "eliminado_admin",
        es_sustituto: false,
        motivo: "Decisión del cliente/admin en vivo"
    };

    await supabase.from("wc_log_picking").insert([logEntry]);

    res.status(200).json({ message: "Producto anulado correctamente." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ NUEVA FUNCIÓN: RESTAURAR ITEM
exports.restoreItemToSession = async (req, res) => {
  const { id_sesion, id_producto } = req.body;

  try {
    const now = new Date().toISOString();

    const { data: session } = await supabase.from("wc_picking_sessions").select("snapshot_pedidos").eq("id", id_sesion).single();
    if (!session) throw new Error("Sesión no encontrada");

    // REVERTIR SOFT DELETE
    const nuevoSnapshot = session.snapshot_pedidos.map(pedido => {
      const nuevosItems = pedido.line_items.map(item => {
        if (item.product_id === id_producto) {
            // Quitamos la bandera is_removed
            return { ...item, is_removed: false, restored_at: now };
        }
        return item;
      });
      return { ...pedido, line_items: nuevosItems };
    });

    const { error: updateError } = await supabase.from("wc_picking_sessions").update({ snapshot_pedidos: nuevoSnapshot }).eq("id", id_sesion);
    if (updateError) throw updateError;

    // LOG DE AUDITORÍA (restaurado_admin)
    const { data: anyAssign } = await supabase.from("wc_asignaciones_pedidos").select("id, id_pedido").eq("id_sesion", id_sesion).limit(1).maybeSingle();

    const logEntry = {
        id_asignacion: anyAssign ? anyAssign.id : null,
        id_pedido: anyAssign ? anyAssign.id_pedido : null,
        id_producto: id_producto,
        nombre_producto: "Item Restaurado", // Opcional buscar nombre real
        fecha_registro: now,
        accion: "restaurado_admin", 
        es_sustituto: false,
        motivo: "Restauración administrativa"
    };

    await supabase.from("wc_log_picking").insert([logEntry]);

    res.status(200).json({ message: "Producto restaurado correctamente." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
// ✅ NUEVA FUNCIÓN: PASAR A CANASTA (FORZADO POR ADMIN)
exports.forcePickItemToSession = async (req, res) => {
  const { id_sesion, id_producto } = req.body;

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

    // 2. Traer logs actuales para saber cuántos faltan
    const { data: currentLogs } = await supabase
      .from("wc_log_picking")
      .select("id_pedido, accion")
      .eq("id_producto_original", id_producto)
      .in("id_asignacion", assignments.map(a => a.id));

    const logsToInsert = [];

    // 3. Revisar cada pedido y agregar lo que falte
    for (let assign of assignments) {
      const items = assign.reporte_snapshot?.line_items || [];
      // Buscar el producto en este pedido
      const foundItem = items.find(i => i.product_id === id_producto || i.variation_id === id_producto);

      if (foundItem) {
        const requiredQty = foundItem.quantity;
        
        // Contar cuántos ya están listos en este pedido
        const pickedQty = currentLogs.filter(l => 
          l.id_pedido === assign.id_pedido && 
          ['recolectado', 'sustituido', 'no_encontrado'].includes(l.accion)
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
            codigo_barras_escaneado: "ADMIN_OVERRIDE"
          });
        }
      }
    }

    // Insertar a la base de datos
    if (logsToInsert.length > 0) {
      const { error: insertError } = await supabase.from("wc_log_picking").insert(logsToInsert);
      if (insertError) throw insertError;
    }

    res.status(200).json({ message: "Producto enviado a canasta correctamente." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};