const { supabase } = require("../services/supabaseClient");

exports.registerAction = async (req, res) => {
  const {
    id_sesion,
    id_producto_original,
    nombre_producto_original,
    accion, // 'recolectado', 'sustituido', 'no_encontrado', 'reset'
    datos_sustituto, // { id, name, price }
    peso_real,       // Decimal
    motivo,          // String
    cantidad_afectada // Int (Ej: Faltaron 2 unidades)
  } = req.body;

  try {
    const fecha = new Date().toISOString();
    const qty = cantidad_afectada || 1;

    // 1. Obtener la asignación correcta (Pedido-Sesión)
    const { data: assignments, error: assignError } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, id_pedido, snapshot_pedido")
      .eq("id_sesion", id_sesion);

    if (assignError || !assignments) throw new Error("Sesión no válida o sin asignaciones");

    // Lógica para encontrar a qué pedido pertenece el producto
    let targetAssignment = null;
    
    // Primero buscamos coincidencia exacta en los items del pedido
    for (let assign of assignments) {
        const items = assign.snapshot_pedido?.line_items || [];
        const found = items.find(i => i.product_id === id_producto_original || i.variation_id === id_producto_original);
        if (found) {
            targetAssignment = assign;
            break;
        }
    }

    // Fallback: Si no se encuentra (raro), usar el primero
    const id_asignacion_final = targetAssignment ? targetAssignment.id : assignments[0].id;
    const id_pedido_final = targetAssignment ? targetAssignment.id_pedido : 0;

    // 2. Preparar el Log Base
    const logData = {
      id_asignacion: id_asignacion_final,
      id_pedido: id_pedido_final,
      id_producto: id_producto_original,
      nombre_producto: nombre_producto_original,
      accion: accion,
      fecha_registro: fecha,
      peso_real: peso_real || null,
      motivo: motivo || null
    };

    // Personalizar según Acción
    if (accion === "sustituido" && datos_sustituto) {
      logData.es_sustituto = true;
      logData.id_producto_final = datos_sustituto.id;
      logData.nombre_sustituto = datos_sustituto.name;
      logData.precio_nuevo = datos_sustituto.price;
    } 
    else if (accion === "no_encontrado") {
       logData.es_sustituto = false;
       // Marca explícita de faltante
    }

    // 3. Insertar Logs (Multiplicar si la cantidad afectada > 1)
    // Esto es vital para que la contabilidad de items sea exacta
    const logsToInsert = Array(qty).fill(logData);
    
    const { error: insertError } = await supabase
      .from("wc_log_picking")
      .insert(logsToInsert);

    if (insertError) throw insertError;

    res.status(200).json({ success: true, message: "Acción registrada correctamente" });

  } catch (error) {
    console.error("Error registrando acción:", error.message);
    res.status(500).json({ error: error.message });
  }
};

exports.validateManualCode = async (req, res) => {
    const { input_code, expected_sku } = req.body;
    // Validación flexible (match exacto o contenido)
    const isValid = 
        input_code.trim().toUpperCase() === expected_sku.trim().toUpperCase() ||
        expected_sku.includes(input_code); 

    res.json({ valid: isValid });
};