const { supabase } = require("../services/supabaseClient");

exports.registerAction = async (req, res) => {
  const {
    id_sesion,
    id_producto_original,
    nombre_producto_original,
    accion, // 'recolectado', 'sustituido', 'no_encontrado', 'reset'
    datos_sustituto, // { id, name, price }
    peso_real, // Decimal (Ej: 1.250)
    motivo, // String
    cantidad_afectada, // Int (Ej: Faltaron 2 unidades)
    pasillo, // String (Ubicación)
  } = req.body;

  try {
    const fecha = new Date().toISOString();
    const qty = cantidad_afectada || 1;

    // 1. Obtener la asignación correcta (Pedido-Sesión)
    const { data: assignments, error: assignError } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, id_pedido, reporte_snapshot")
      .eq("id_sesion", id_sesion);

    if (assignError || !assignments || assignments.length === 0)
      throw new Error("Sesión inválida o sin asignaciones");

    // Lógica para encontrar a qué pedido pertenece el producto (Match en snapshot)
    let targetAssignment = assignments[0]; // Default

    // Primero buscamos coincidencia exacta en los items del pedido
    for (let assign of assignments) {
      const items = assign.reporte_snapshot?.line_items || [];
      const found = items.find(
        (i) =>
          i.product_id === id_producto_original ||
          i.variation_id === id_producto_original,
      );
      if (found) {
        targetAssignment = assign;
        break;
      }
    }

    // 2. Preparar el Log Base
    const logData = {
      id_asignacion: targetAssignment.id,
      id_pedido: targetAssignment.id_pedido,
      id_producto: id_producto_original, // Producto afectado
      id_producto_original: id_producto_original, // ✅ CLAVE PARA LA CORRECCIÓN SPLIT
      nombre_producto: nombre_producto_original,
      accion: accion,
      fecha_registro: fecha,
      peso_real: peso_real || null,
      motivo: motivo || null,
      pasillo: pasillo || "General", // ✅ CLAVE PARA EL DASHBOARD ADMIN
    };

    // Personalizar según Acción
    if (accion === "sustituido" && datos_sustituto) {
      logData.es_sustituto = true;
      logData.id_producto_final = datos_sustituto.id;
      logData.nombre_sustituto = datos_sustituto.name;
      logData.precio_nuevo = datos_sustituto.price;
    } else if (accion === "no_encontrado") {
      logData.es_sustituto = false;
    }

    // 3. Insertar Logs (Multiplicar si la cantidad afectada > 1 para trazabilidad unitaria)
    const logsToInsert = Array(qty).fill(logData);

    const { error: insertError } = await supabase
      .from("wc_log_picking")
      .insert(logsToInsert);

    if (insertError) throw insertError;

    res
      .status(200)
      .json({ success: true, message: "Acción registrada correctamente" });
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
