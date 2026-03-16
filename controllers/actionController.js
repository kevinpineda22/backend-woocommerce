const { supabase } = require("../services/supabaseClient");

exports.registerAction = async (req, res) => {
  const {
    id_sesion,
    id_producto_original,
    nombre_producto_original,
    accion, // 'recolectado', 'sustituido', 'no_encontrado', 'reset'
    datos_sustituto,
    peso_real,
    motivo,
    cantidad_afectada,
    pasillo,
    codigo_barras_escaneado, // ✅ NUEVO: Código de barras exacto que se escaneó
  } = req.body;

  try {
    const fecha = new Date().toISOString();
    const qty = cantidad_afectada || 1;

    // 1. Validar Sesión y obtener Asignación
    // ✅ CORRECCIÓN VITAL: Usamos 'reporte_snapshot' (así se llama en tu DB)
    const { data: assignments, error: assignError } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, id_pedido, reporte_snapshot")
      .eq("id_sesion", id_sesion);

    if (assignError || !assignments || assignments.length === 0) {
      // console.error("Error buscando asignación:", assignError);
      throw new Error("Sesión inválida o sin asignaciones");
    }

    // Lógica de Match (Buscar a qué pedido pertenece el producto)
    let targetAssignment = assignments[0];
    for (let assign of assignments) {
      const items = assign.reporte_snapshot?.line_items || [];
      const found = items.find(
        (i) =>
          String(i.product_id) === String(id_producto_original) ||
          String(i.variation_id) === String(id_producto_original),
      );
      if (found) {
        targetAssignment = assign;
        break;
      }
    }

    const allAssignmentIds = assignments.map((a) => a.id);

    // Multi-Sede: Obtener sede_id de la sesión para propagarla al log
    let sedeId = req.sedeId || null;
    if (!sedeId) {
      const { data: sessionData } = await supabase
        .from("wc_picking_sessions")
        .select("sede_id")
        .eq("id", id_sesion)
        .single();
      if (sessionData) sedeId = sessionData.sede_id;
    }

    // =================================================================
    // CASO REVERT SHORT PICK: BORRAR SÓLO LOGS DE "no_encontrado"
    // =================================================================
    if (accion === "revert_short_pick") {
      const { error: delError } = await supabase
        .from("wc_log_picking")
        .delete()
        .in("id_asignacion", allAssignmentIds)
        .eq("id_producto_original", id_producto_original)
        .eq("accion", "no_encontrado");

      if (delError) throw delError;

      return res.status(200).json({
        success: true,
        message: "Logs de stock insuficiente revertidos",
      });
    }

    // =================================================================
    // CASO RESET (DESHACER): BORRAR LOGS FÍSICAMENTE
    // =================================================================
    if (accion === "reset") {
      // Buscamos los últimos logs de este producto en toda la sesión (ignorando los de "no_encontrado" que se manejan aparte)
      let query = supabase
        .from("wc_log_picking")
        .select("id")
        .in("id_asignacion", allAssignmentIds)
        .neq("accion", "no_encontrado")
        .eq("id_producto_original", id_producto_original)
        .order("fecha_registro", { ascending: false });

      if (qty && qty > 0) {
        query = query.limit(qty);
      }

      const { data: logsToDelete, error: selectError } = await query;

      if (selectError) {
        console.error("Error fetching logs to delete:", selectError);
      }

      if (logsToDelete && logsToDelete.length > 0) {
        const ids = logsToDelete.map((l) => l.id);
        // Eliminación física para que el conteo baje
        const { error: delError } = await supabase
          .from("wc_log_picking")
          .delete()
          .in("id", ids);
        if (delError) throw delError;
      }

      return res
        .status(200)
        .json({ success: true, message: "Item devuelto a pendientes" });
    }

    // =================================================================
    // CASO NORMAL (INSERTAR ACCIÓN)
    // =================================================================
    const logData = {
      id_asignacion: targetAssignment.id,
      id_pedido: targetAssignment.id_pedido,
      id_producto: id_producto_original,
      id_producto_original: id_producto_original,
      nombre_producto: nombre_producto_original,
      accion: accion,
      fecha_registro: fecha,
      peso_real: peso_real || null,
      motivo: motivo || null,
      pasillo: pasillo || "General",
      codigo_barras_escaneado: codigo_barras_escaneado || null,
      sede_id: sedeId, // ✅ MULTI-SEDE
    };

    if (accion === "sustituido" && datos_sustituto) {
      logData.es_sustituto = true;
      logData.id_producto_final = datos_sustituto.id;
      logData.nombre_sustituto = datos_sustituto.name;
      logData.precio_nuevo = datos_sustituto.price;
    } else if (accion === "no_encontrado") {
      logData.es_sustituto = false;
    }

    const logsToInsert = Array(qty).fill(logData);

    const { error: insertError } = await supabase
      .from("wc_log_picking")
      .insert(logsToInsert);

    if (insertError) throw insertError;

    res.status(200).json({ success: true, message: "Acción registrada" });
  } catch (error) {
    console.error(
      `Error registrando acción '${accion}' para producto ${id_producto_original}:`,
      error.message,
    );
    res.status(500).json({
      error: `Error al registrar acción '${accion}': ${error.message}`,
    });
  }
};

exports.validateManualCode = async (req, res) => {
  const { input_code, expected_sku, expected_barcode } = req.body;
  if (!input_code) return res.json({ valid: false });

  const code = input_code.trim().toUpperCase();

  // 1. Validar contra el SKU
  const skuMatch =
    expected_sku &&
    (code === expected_sku.trim().toUpperCase() ||
      expected_sku.toUpperCase().includes(code));

  // 2. Validar contra la Lista de Códigos de Barras (Si la manda el frontend)
  let barcodeMatch = false;
  if (Array.isArray(expected_barcode)) {
    barcodeMatch = expected_barcode.some((b) => {
      const str = (b || "").toString().toUpperCase();
      return code === str || str.endsWith(code);
    });
  } else if (expected_barcode) {
    const ean = expected_barcode.toString().trim().toUpperCase();
    barcodeMatch = code === ean || ean.endsWith(code);
  }

  res.json({ valid: skuMatch || barcodeMatch });
};
