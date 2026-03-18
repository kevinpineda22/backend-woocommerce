const { supabase } = require("../services/supabaseClient");

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
        if (!cleaned || cleaned.replace(/\+$/, "").length < 8) return false;
        if (
          cleaned.toUpperCase().startsWith("M") ||
          cleaned.toUpperCase().startsWith("N")
        )
          return false;
        return /^\d+\+?$/.test(cleaned);
      });

    const ean13 = validCodes.find((c) => c.replace(/\+$/, "").length === 13);
    return ean13 || validCodes[0] || null;
  } catch (e) {
    console.error("Error buscando barcode SIESA para SKU", sku, e.message);
    return null;
  }
}

exports.removeItemFromSession = async (req, res) => {
  const { id_sesion, id_producto } = req.body;

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
      const { error: insertError } = await supabase
        .from("wc_log_picking")
        .insert(logsToInsert);
      if (insertError) throw insertError;
    }

    res
      .status(200)
      .json({ message: "Producto enviado a canasta correctamente." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
