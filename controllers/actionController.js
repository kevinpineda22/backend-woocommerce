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
    pasillo          
  } = req.body;

  try {
    const fecha = new Date().toISOString();
    const qty = cantidad_afectada || 1;

    // 1. Validar Sesión
    const { data: assignments, error: assignError } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, id_pedido, snapshot_pedido")
      .eq("id_sesion", id_sesion);

    if (assignError || !assignments || assignments.length === 0) throw new Error("Sesión inválida");

    // Lógica de Match (Buscar a qué pedido pertenece)
    let targetAssignment = assignments[0]; 
    for (let assign of assignments) {
        const items = assign.snapshot_pedido?.line_items || [];
        const found = items.find(i => i.product_id === id_producto_original || i.variation_id === id_producto_original);
        if (found) {
            targetAssignment = assign;
            break;
        }
    }

    // =================================================================
    // 🚨 CORRECCIÓN CRÍTICA: LÓGICA DE RESET (DESHACER)
    // =================================================================
    if (accion === 'reset') {
        // Buscamos los últimos logs de este producto en esta sesión y los BORRAMOS.
        const { data: logsToDelete } = await supabase
            .from("wc_log_picking")
            .select("id")
            .eq("id_asignacion", targetAssignment.id)
            .or(`id_producto.eq.${id_producto_original},id_producto_original.eq.${id_producto_original}`)
            .order("fecha_registro", { ascending: false })
            .limit(qty); // Borramos solo la cantidad que se devolvió

        if (logsToDelete && logsToDelete.length > 0) {
            const ids = logsToDelete.map(l => l.id);
            // ELIMINACIÓN FÍSICA: Esto hace que el conteo baje en tiempo real
            const { error: delError } = await supabase.from("wc_log_picking").delete().in("id", ids);
            if (delError) throw delError;
        }

        return res.status(200).json({ success: true, message: "Item devuelto a pendientes" });
    }

    // =================================================================
    // CASO NORMAL (INSERTAR)
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
      pasillo: pasillo || "General" 
    };

    if (accion === "sustituido" && datos_sustituto) {
      logData.es_sustituto = true;
      logData.id_producto_final = datos_sustituto.id;
      logData.nombre_sustituto = datos_sustituto.name;
      logData.precio_nuevo = datos_sustituto.price;
    } 
    else if (accion === "no_encontrado") {
       logData.es_sustituto = false;
    }

    const logsToInsert = Array(qty).fill(logData);
    const { error: insertError } = await supabase.from("wc_log_picking").insert(logsToInsert);

    if (insertError) throw insertError;

    res.status(200).json({ success: true, message: "Acción registrada" });

  } catch (error) {
    console.error("Error registrando acción:", error.message);
    res.status(500).json({ error: error.message });
  }
};

exports.validateManualCode = async (req, res) => {
    const { input_code, expected_sku } = req.body;
    const isValid = input_code.trim().toUpperCase() === expected_sku.trim().toUpperCase() || expected_sku.includes(input_code); 
    res.json({ valid: isValid });
};