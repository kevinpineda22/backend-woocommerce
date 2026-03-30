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
    codigo_barras_escaneado, // ✅ Código de barras exacto que se escaneó
    f120_id_siesa, // ✅ NUEVO: f120_id encontrado en SIESA
    unidad_medida_siesa, // ✅ NUEVO: unidad_medida encontrada en SIESA
    id_pedido, // ✅ NUEVO: Para desambiguar cuando el mismo producto está en varios pedidos
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

    // ✅ Si el frontend envía id_pedido, usarlo directamente para encontrar la asignación correcta
    let targetAssignment = assignments[0];
    if (id_pedido) {
      const exactMatch = assignments.find(
        (a) => String(a.id_pedido) === String(id_pedido),
      );
      if (exactMatch) {
        targetAssignment = exactMatch;
      }
    } else {
      // Fallback: buscar a qué pedido pertenece el producto
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
    // CASO RESET_SUSTITUTO: Solo borrar logs de sustitución (mantener recolectados)
    // =================================================================
    if (accion === "reset_sustituto") {
      const { data: subLogs, error: subErr } = await supabase
        .from("wc_log_picking")
        .select("id")
        .in("id_asignacion", allAssignmentIds)
        .eq("id_producto_original", id_producto_original)
        .eq("accion", "sustituido");

      if (subErr) {
        console.error("Error fetching sustituto logs:", subErr);
      }

      if (subLogs && subLogs.length > 0) {
        const ids = subLogs.map((l) => l.id);
        const { error: delError } = await supabase
          .from("wc_log_picking")
          .delete()
          .in("id", ids);
        if (delError) throw delError;
      }

      return res
        .status(200)
        .json({ success: true, message: "Sustitución revertida" });
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
      sede_id: sedeId,
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

  // 1. Validar contra el SKU (solo coincidencia EXACTA, no parcial)
  const skuMatch = expected_sku && code === expected_sku.trim().toUpperCase();

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

// ✅ FUNCIÓN PRIVADA COMPARTIDA - Validación unificada
// Picker y Auditor usan esta función con parámetro allowGS1 diferente
async function _validateSiesaCode(codigo, f120_id_esperado, unidad_medida_esperada, { allowGS1 = false } = {}) {
  const codigoLimpio = codigo.toString().trim().toUpperCase();
  const isValidBarcode = /^\d{8,}\+?$/.test(codigoLimpio);
  const isValidSku = /^\d+[A-Z]+\d*$/.test(codigoLimpio);

  if (!isValidBarcode && !isValidSku) {
    return {
      status: 200,
      body: {
        valid: false,
        message: "❌ Código inválido. Escanea el código de barras del producto.",
        codigo_existe: false,
      },
    };
  }

  // RUTA 1: SKU directo (ej: "1032P2")
  if (isValidSku) {
    const skuMatch = codigoLimpio.match(/^(\d+)([A-Z]+\d*)$/);
    if (skuMatch) {
      const f120Ingresado = parseInt(skuMatch[1]);
      const umIngresada = skuMatch[2];
      const skuIngresado = `${f120Ingresado}${umIngresada}`;
      const cleanSku = (s) => s.replace(/-/g, "");
      const skuEsperado = cleanSku(`${f120_id_esperado}${unidad_medida_esperada}`);

      if (skuIngresado === skuEsperado) {
        return {
          status: 200,
          body: {
            valid: true,
            message: "✅ SKU validado correctamente",
            sku_encontrado: skuIngresado,
            f120_id: f120Ingresado,
            unidad_medida: umIngresada,
          },
        };
      }

      if (f120Ingresado === f120_id_esperado) {
        return {
          status: 200,
          body: {
            valid: false,
            message: `❌ Presentación incorrecta: digitaste ${umIngresada}, pero se esperaba ${unidad_medida_esperada}`,
          },
        };
      }

      return {
        status: 200,
        body: { valid: false, message: "❌ El SKU no corresponde a este producto" },
      };
    }
  }

  // RUTA 2A: GS1 variable (solo si allowGS1 = true, ej: picker)
  if (allowGS1) {
    const isGS1Variable = /^\d{13,14}$/.test(codigoLimpio) && codigoLimpio.startsWith("2");
    if (isGS1Variable) {
      const gs1Prefix = codigoLimpio.substring(0, 7);
      const { data: siesaBarcodes } = await supabase
        .from("siesa_codigos_barras")
        .select("f120_id, unidad_medida, codigo_barras")
        .eq("f120_id", f120_id_esperado);

      const gs1Match = (siesaBarcodes || []).some((bc) => {
        const cleanBarcode = (bc.codigo_barras || "").toString().trim().replace(/\+$/, "");
        return cleanBarcode.startsWith("2") && cleanBarcode.length >= 7 && gs1Prefix === cleanBarcode.substring(0, 7);
      });

      if (gs1Match) {
        return {
          status: 200,
          body: {
            valid: true,
            message: "✅ Código GS1 validado correctamente",
            sku_encontrado: `${f120_id_esperado}${unidad_medida_esperada}`,
            f120_id: f120_id_esperado,
            unidad_medida: unidad_medida_esperada,
          },
        };
      }

      return {
        status: 200,
        body: { valid: false, message: "❌ El código GS1 no corresponde a este producto", codigo_existe: false },
      };
    }
  }

  // RUTA 2B: Barcode exacto en SIESA
  const { data: siesaData, error: siesaError } = await supabase
    .from("siesa_codigos_barras")
    .select("f120_id, unidad_medida")
    .eq("codigo_barras", codigoLimpio)
    .single();

  if (siesaError || !siesaData) {
    return {
      status: 200,
      body: { valid: false, message: "❌ Código no encontrado en el sistema", codigo_existe: false },
    };
  }

  const cleanSku = (sku) => sku.replace(/-/g, "");
  const skuEscaneado = cleanSku(`${siesaData.f120_id}${siesaData.unidad_medida}`);
  const skuEsperado = cleanSku(`${f120_id_esperado}${unidad_medida_esperada}`);

  if (skuEscaneado !== skuEsperado) {
    if (siesaData.f120_id === f120_id_esperado) {
      return {
        status: 200,
        body: {
          valid: false,
          message: `❌ El código que escaneaste es para ${siesaData.unidad_medida}, pero se esperaba ${unidad_medida_esperada}`,
          f120_id_coincide: true,
          unidad_media_encontrada: siesaData.unidad_medida,
          unidad_medida_esperada,
        },
      };
    }
    return {
      status: 200,
      body: {
        valid: false,
        message: "❌ El código pertenece a un producto diferente",
        f120_id_encontrado: siesaData.f120_id,
        f120_id_esperado,
      },
    };
  }

  return {
    status: 200,
    body: {
      valid: true,
      message: "✅ Código validado correctamente",
      sku_encontrado: skuEscaneado,
      f120_id: siesaData.f120_id,
      unidad_medida: siesaData.unidad_medida,
    },
  };
}

/**
 * PICKER: Validar código contra SIESA considerando presentaciones
 * Acepta códigos GS1 de peso variable (carnicería: etiquetas de báscula)
 */
exports.validateCodeWithSiesa = async (req, res) => {
  const { codigo, f120_id_esperado, unidad_medida_esperada } = req.body;

  if (!codigo || !f120_id_esperado || !unidad_medida_esperada) {
    return res.status(400).json({
      valid: false,
      message: "Parámetros incompletos",
    });
  }

  try {
    const result = await _validateSiesaCode(codigo, f120_id_esperado, unidad_medida_esperada, { allowGS1: true });
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Error en validateCodeWithSiesa:", error.message);
    return res.status(500).json({ valid: false, message: "Error al validar código", error: error.message });
  }
};

/**
 * Validar código para AUDITOR - IGUAL DE RESTRICTIVO QUE PICKER
 * Valida presentación EXACTA (f120_id + unidad_medida)
 * El auditor digita CANTIDAD manualmente (diferencia con picker)
 * Diferencia: Picker valida por unidad, Auditor valida cantidad total de una vez
 */
exports.validateCodeForAuditor = async (req, res) => {
  const { codigo, f120_id_esperado, unidad_medida_esperada } = req.body;

  if (!codigo || !f120_id_esperado || !unidad_medida_esperada) {
    return res.status(400).json({
      valid: false,
      message: "Parámetros incompletos",
    });
  }

  try {
    const result = await _validateSiesaCode(codigo, f120_id_esperado, unidad_medida_esperada, { allowGS1: false });
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Error en validateCodeForAuditor:", error.message);
    return res.status(500).json({ valid: false, message: "Error al validar código", error: error.message });
  }
};

/**
 * AUDITOR: Buscar un código en SIESA por codigo_barras o formato SKU.
 * Retorna el f120_id y unidad_medida sin validar contra un producto esperado.
 * El frontend usa el f120_id para matchear contra los items pendientes.
 */
exports.lookupSiesaCode = async (req, res) => {
  const { codigo } = req.body;
  if (!codigo) {
    return res.status(400).json({ found: false, message: "Código requerido" });
  }

  const codigoLimpio = codigo.toString().trim().toUpperCase();

  try {
    // 1. Intentar parsear como SKU (ej: "1032P2" → f120=1032, um=P2)
    const skuMatch = codigoLimpio.match(/^(\d+)([A-Z]+\d*)$/);
    if (skuMatch) {
      const f120Id = parseInt(skuMatch[1]);
      const um = skuMatch[2];
      // Verificar que existe en SIESA
      const { data } = await supabase
        .from("siesa_codigos_barras")
        .select("f120_id, unidad_medida, codigo_barras")
        .eq("f120_id", f120Id)
        .eq("unidad_medida", um)
        .limit(1);
      if (data && data.length > 0) {
        return res.json({ found: true, f120_id: f120Id, unidad_medida: um });
      }
    }

    // 2. Buscar como codigo_barras exacto
    const { data: byBarcode } = await supabase
      .from("siesa_codigos_barras")
      .select("f120_id, unidad_medida")
      .eq("codigo_barras", codigoLimpio)
      .single();
    if (byBarcode) {
      return res.json({ found: true, f120_id: byBarcode.f120_id, unidad_medida: byBarcode.unidad_medida });
    }

    // 3. Intentar con "+" al final (convención SIESA)
    const { data: byBarcodePlus } = await supabase
      .from("siesa_codigos_barras")
      .select("f120_id, unidad_medida")
      .eq("codigo_barras", codigoLimpio + "+")
      .single();
    if (byBarcodePlus) {
      return res.json({ found: true, f120_id: byBarcodePlus.f120_id, unidad_medida: byBarcodePlus.unidad_medida });
    }

    return res.json({ found: false, message: "Código no encontrado en SIESA" });
  } catch (error) {
    console.error("Error en lookupSiesaCode:", error.message);
    return res.status(500).json({ found: false, message: "Error buscando código" });
  }
};
