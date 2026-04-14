const { supabase } = require("../services/supabaseClient");
const { logAuditEvent } = require("../services/auditService");

// Mapeo de acción de picking → acción de audit log
const PICKING_ACTION_MAP = {
  recolectado: "item.picked",
  sustituido: "item.substituted",
  no_encontrado: "item.not_found",
  reset: "item.reset",
  revert_short_pick: "item.revert_short_pick",
  reset_sustituto: "item.reset_sustituto",
};

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

    // Multi-Sede: Obtener sede_id y picker de la sesión
    let sedeId = req.sedeId || null;
    let pickerIdForAudit = null;
    {
      const { data: sessionData } = await supabase
        .from("wc_picking_sessions")
        .select("sede_id, id_picker")
        .eq("id", id_sesion)
        .single();
      if (sessionData) {
        if (!sedeId) sedeId = sessionData.sede_id;
        pickerIdForAudit = sessionData.id_picker;
      }
    }

    const auditItem = (auditAction, extraMeta = {}) => {
      logAuditEvent({
        actor: { type: "picker", id: pickerIdForAudit, name: null },
        action: auditAction,
        entity: { type: "session", id: id_sesion },
        sedeId,
        metadata: {
          id_producto: id_producto_original,
          nombre_producto: nombre_producto_original,
          cantidad: qty,
          id_pedido: id_pedido || null,
          ...extraMeta,
        },
      });
    };

    // =================================================================
    // CASO REVERT SHORT PICK: BORRAR SÓLO LOGS DE "no_encontrado"
    // =================================================================
    if (accion === "revert_short_pick") {
      // ✅ Usar targetAssignment.id si id_pedido fue proporcionado, para no afectar otros pedidos
      const scopeIds = id_pedido ? [targetAssignment.id] : allAssignmentIds;
      const { error: delError } = await supabase
        .from("wc_log_picking")
        .delete()
        .in("id_asignacion", scopeIds)
        .eq("id_producto_original", id_producto_original)
        .eq("accion", "no_encontrado");

      if (delError) throw delError;

      auditItem(PICKING_ACTION_MAP.revert_short_pick);

      return res.status(200).json({
        success: true,
        message: "Logs de stock insuficiente revertidos",
      });
    }

    // =================================================================
    // CASO RESET (DESHACER): BORRAR LOGS FÍSICAMENTE
    // =================================================================
    if (accion === "reset") {
      // ✅ Usar targetAssignment.id si id_pedido fue proporcionado, para no afectar otros pedidos
      const scopeIds = id_pedido ? [targetAssignment.id] : allAssignmentIds;
      let query = supabase
        .from("wc_log_picking")
        .select("id")
        .in("id_asignacion", scopeIds)
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

      auditItem(PICKING_ACTION_MAP.reset);

      return res
        .status(200)
        .json({ success: true, message: "Item devuelto a pendientes" });
    }

    // =================================================================
    // CASO RESET_SUSTITUTO: Solo borrar logs de sustitución (mantener recolectados)
    // =================================================================
    if (accion === "reset_sustituto") {
      // ✅ Usar targetAssignment.id si id_pedido fue proporcionado, para no afectar otros pedidos
      const scopeIds = id_pedido ? [targetAssignment.id] : allAssignmentIds;
      const { data: subLogs, error: subErr } = await supabase
        .from("wc_log_picking")
        .select("id")
        .in("id_asignacion", scopeIds)
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

      auditItem(PICKING_ACTION_MAP.reset_sustituto);

      return res
        .status(200)
        .json({ success: true, message: "Sustitución revertida" });
    }

    // =================================================================
    // CASO NORMAL (INSERTAR ACCIÓN)
    // =================================================================
    let finalScannedBarcode = codigo_barras_escaneado || null;

    // 🚀 LÓGICA MAESTRA GS1: Si es pesable y no tenemos código GS1 completo, construirlo
    if (peso_real && peso_real > 0 && f120_id_siesa) {
      const isAlreadyGS1 =
        finalScannedBarcode &&
        finalScannedBarcode.startsWith("2") &&
        (finalScannedBarcode.length === 13 ||
          finalScannedBarcode.length === 14);

      if (!isAlreadyGS1) {
        try {
          // 1. Buscar código base en SIESA (ej: 2900089 para Yuca)
          const { data: siesaCodes } = await supabase
            .from("siesa_codigos_barras")
            .select("codigo_barras")
            .eq("f120_id", f120_id_siesa)
            .startsWith("codigo_barras", "2")
            .limit(1);

          if (siesaCodes && siesaCodes.length > 0) {
            const baseBarcode = siesaCodes[0].codigo_barras
              .toString()
              .replace(/\+$/, "");
            if (baseBarcode.length >= 7) {
              const base7 = baseBarcode.substring(0, 7);
              const pesoGramos = Math.round(peso_real * 1000);
              const pesoStr = pesoGramos.toString().padStart(5, "0");
              const sinCheck = base7 + pesoStr;

              // Calcular Check Digit GS1 (Luhn mod 10)
              let sum = 0;
              for (let i = 0; i < 12; i++) {
                const d = parseInt(sinCheck[i]);
                const weight = (12 - i) % 2 === 1 ? 3 : 1;
                sum += d * weight;
              }
              const checkDigit = (10 - (sum % 10)) % 10;
              finalScannedBarcode = `${sinCheck}${checkDigit}`;
            }
          } else {
            // 🚀 FALLBACK: Si no hay base 29, mantenemos lo que venga del front
            // para no bloquear al picker.
            console.warn(
              `⚠️ No se encontró base GS1 para item ${f120_id_siesa}. Usando SKU.`,
            );
          }
        } catch (err) {
          console.error("Error generando GS1 en backend:", err.message);
        }
      }
    }

    // =================================================================
    // 🛡️ GUARD 1: DEBOUNCE — Rechazar acción duplicada en ventana de 3 segundos
    // Previene: double-tap del picker, replay de cola offline
    // =================================================================
    if (accion === "recolectado" || accion === "sustituido") {
      const threeSecondsAgo = new Date(Date.now() - 3000).toISOString();
      const { data: recentDups } = await supabase
        .from("wc_log_picking")
        .select("id")
        .eq("id_asignacion", targetAssignment.id)
        .eq("id_producto_original", id_producto_original)
        .eq("accion", accion)
        .gte("fecha_registro", threeSecondsAgo)
        .limit(1);

      if (recentDups && recentDups.length > 0) {
        console.warn(
          `⚠️ DEBOUNCE: Acción duplicada bloqueada — ${accion} producto ${id_producto_original} asignación ${targetAssignment.id}`,
        );
        return res
          .status(200)
          .json({ success: true, message: "Acción duplicada ignorada" });
      }
    }

    // =================================================================
    // 🛡️ GUARD 2: QUANTITY CAP — No permitir más logs que la qty del pedido
    // Previene: cualquier forma de over-picking (doble-tap, bug, manipulación)
    // =================================================================
    if (accion === "recolectado" || accion === "sustituido") {
      const snapshot = targetAssignment.reporte_snapshot;
      if (snapshot?.line_items) {
        const matchingItems = snapshot.line_items.filter(
          (i) =>
            String(i.product_id) === String(id_producto_original) ||
            String(i.variation_id) === String(id_producto_original),
        );
        const expectedQty = matchingItems.reduce(
          (sum, i) => sum + (i.quantity || 0),
          0,
        );

        if (expectedQty > 0) {
          const { count: existingCount } = await supabase
            .from("wc_log_picking")
            .select("id", { count: "exact", head: true })
            .eq("id_asignacion", targetAssignment.id)
            .eq("id_producto_original", id_producto_original)
            .in("accion", ["recolectado", "sustituido"]);

          if ((existingCount || 0) + qty > expectedQty) {
            console.warn(
              `⚠️ QUANTITY CAP: Over-pick bloqueado — existentes=${existingCount} + nuevos=${qty} > esperados=${expectedQty} producto ${id_producto_original}`,
            );
            return res
              .status(200)
              .json({ success: true, message: "Cantidad máxima alcanzada" });
          }
        }
      }
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
      codigo_barras_escaneado: finalScannedBarcode,
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

    const auditAction = PICKING_ACTION_MAP[accion] || `item.${accion}`;
    const extraMeta = {};
    if (accion === "sustituido" && datos_sustituto) {
      extraMeta.sustituto = {
        id: datos_sustituto.id,
        name: datos_sustituto.name,
        price: datos_sustituto.price,
      };
    }
    if (accion === "no_encontrado" && motivo) extraMeta.motivo = motivo;
    if (peso_real) extraMeta.peso_real = peso_real;
    auditItem(auditAction, extraMeta);

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
async function _validateSiesaCode(
  codigo,
  f120_id_esperado,
  unidad_medida_esperada,
  { allowGS1 = false } = {},
) {
  const codigoLimpio = codigo.toString().trim().toUpperCase();
  const isValidBarcode = /^\d{8,}\+?$/.test(codigoLimpio);
  const isValidSku = /^\d+[A-Z]+\d*$/.test(codigoLimpio);

  if (!isValidBarcode && !isValidSku) {
    return {
      status: 200,
      body: {
        valid: false,
        message:
          "❌ Código inválido. Escanea el código de barras del producto.",
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
      const skuEsperado = cleanSku(
        `${f120_id_esperado}${unidad_medida_esperada}`,
      );

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
        body: {
          valid: false,
          message: "❌ El SKU no corresponde a este producto",
        },
      };
    }
  }

  // RUTA 2A: GS1 variable (solo si allowGS1 = true, ej: picker)
  if (allowGS1) {
    const isGS1Variable =
      /^\d{13,14}$/.test(codigoLimpio) && codigoLimpio.startsWith("2");
    if (isGS1Variable) {
      const gs1Prefix = codigoLimpio.substring(0, 7);
      const { data: siesaBarcodes } = await supabase
        .from("siesa_codigos_barras")
        .select("f120_id, unidad_medida, codigo_barras")
        .eq("f120_id", f120_id_esperado);

      const gs1Match = (siesaBarcodes || []).some((bc) => {
        const cleanBarcode = (bc.codigo_barras || "")
          .toString()
          .trim()
          .replace(/\+$/, "");
        return (
          cleanBarcode.startsWith("2") &&
          cleanBarcode.length >= 7 &&
          gs1Prefix === cleanBarcode.substring(0, 7)
        );
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
        body: {
          valid: false,
          message: "❌ El código GS1 no corresponde a este producto",
          codigo_existe: false,
        },
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
      body: {
        valid: false,
        message: "❌ Código no encontrado en el sistema",
        codigo_existe: false,
      },
    };
  }

  const cleanSku = (sku) => sku.replace(/-/g, "");
  const skuEscaneado = cleanSku(
    `${siesaData.f120_id}${siesaData.unidad_medida}`,
  );
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
    const result = await _validateSiesaCode(
      codigo,
      f120_id_esperado,
      unidad_medida_esperada,
      { allowGS1: true },
    );
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Error en validateCodeWithSiesa:", error.message);
    return res.status(500).json({
      valid: false,
      message: "Error al validar código",
      error: error.message,
    });
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
    const result = await _validateSiesaCode(
      codigo,
      f120_id_esperado,
      unidad_medida_esperada,
      { allowGS1: true }, // ✅ CAMBIO: Ahora el auditor también acepta GS1
    );
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Error en validateCodeForAuditor:", error.message);
    return res.status(500).json({
      valid: false,
      message: "Error al validar código",
      error: error.message,
    });
  }
};

/**
 * AUDITOR: Cargar todos los codigo_barras para una lista de f120_ids.
 * Retorna un mapa { codigo_barras: { f120_id, unidad_medida } } para validación local en el frontend.
 */
exports.loadBarcodesForAudit = async (req, res) => {
  const { f120_ids } = req.body;
  if (!f120_ids || !Array.isArray(f120_ids) || f120_ids.length === 0) {
    return res
      .status(400)
      .json({ error: "f120_ids requerido (array de enteros)" });
  }

  try {
    const { data, error } = await supabase
      .from("siesa_codigos_barras")
      .select("f120_id, codigo_barras, unidad_medida")
      .in("f120_id", f120_ids);

    if (error) throw error;

    // Mapa: codigo_barras (normalizado) → { f120_id, unidad_medida }
    const barcodeMap = {};
    (data || []).forEach((row) => {
      const um = (row.unidad_medida || "").toUpperCase();
      const cleanCode = row.codigo_barras
        .toString()
        .trim()
        .replace(/\+$/, "")
        .toUpperCase();
      barcodeMap[cleanCode] = { f120_id: row.f120_id, unidad_medida: um };
      // También guardar versión original (con +) por si acaso
      const original = row.codigo_barras.toString().trim().toUpperCase();
      barcodeMap[original] = { f120_id: row.f120_id, unidad_medida: um };
    });

    return res.json({ barcodeMap });
  } catch (error) {
    console.error("Error en loadBarcodesForAudit:", error.message);
    return res.status(500).json({ error: "Error cargando códigos de barras" });
  }
};
