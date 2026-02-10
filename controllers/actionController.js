const { supabase } = require("../services/supabaseClient");

exports.registerAction = async (req, res) => {
  const {
    id_sesion, id_producto_original, nombre_producto_original,
    accion, peso_real, datos_sustituto,
  } = req.body;

  try {
    const now = new Date();

    if (accion === "reset") {
      const { data: assigns } = await supabase.from("wc_asignaciones_pedidos").select("id").eq("id_sesion", id_sesion);
      if (assigns && assigns.length > 0) {
        const assignIds = assigns.map((a) => a.id);
        await supabase.from("wc_log_picking").delete().in("id_asignacion", assignIds).eq("id_producto", id_producto_original);
      }
      return res.status(200).json({ status: "ok", message: "Reset OK" });
    }

    const { data: anyAssign } = await supabase.from("wc_asignaciones_pedidos").select("id, id_pedido").eq("id_sesion", id_sesion).limit(1).maybeSingle();

    const logEntry = {
      id_asignacion: anyAssign ? anyAssign.id : null,
      id_pedido: anyAssign ? anyAssign.id_pedido : null,
      id_producto: id_producto_original,
      fecha_registro: now,
      peso_real: peso_real || null,
      accion: "recolectado",
      nombre_producto: nombre_producto_original
    };

    if (accion === "sustituido") {
      logEntry.es_sustituto = true;
      logEntry.motivo = "Sustitución";
      logEntry.accion = "recolectado"; 
      if (datos_sustituto) {
        logEntry.id_producto_final = datos_sustituto.id;
        logEntry.nombre_sustituto = datos_sustituto.name;
        logEntry.precio_nuevo = datos_sustituto.price;
      }
    } else {
        logEntry.es_sustituto = false;
        logEntry.accion = "recolectado";
    }

    const { error } = await supabase.from("wc_log_picking").insert([logEntry]);
    if (error) throw error;

    res.status(200).json({ status: "ok" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.validateManualCode = async (req, res) => {
  const { input_code, expected_sku } = req.body;
  if (!input_code || !expected_sku) return res.status(400).json({ valid: false });
  const cleanInput = input_code.toString().trim();
  const cleanSku = expected_sku.toString().trim();

  try {
    if (cleanInput === cleanSku) return res.status(200).json({ valid: true, type: "id_directo" });
    const { data: barcodeMatch } = await supabase.from("siesa_codigos_barras").select("id").eq("codigo_barras", cleanInput).eq("f120_id", cleanSku).maybeSingle();
    if (barcodeMatch) return res.status(200).json({ valid: true, type: "codigo_barras" });
    return res.status(200).json({ valid: false });
  } catch (error) {
    res.status(500).json({ valid: false });
  }
};