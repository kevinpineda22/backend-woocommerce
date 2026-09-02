const { supabase } = require("../services/supabaseClient");
const { logAuditEvent } = require("../services/auditService");
const {
  REASON,
  barcodeVariants,
  normalizeUM,
  isScannableInput,
  buildBarcodeIndex,
  availableUMsFor,
  matchScannedCode,
  resolveExpectedUM,
  findGs1Base,
  buildWeighableCode,
} = require("../utils/siesaMatching");

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
    action_id, // ✅ NUEVO: UUID de idempotencia generado por el picker al encolar
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

    // ═══════════════════════════════════════════════════════════════
    // GS1 DE PESO VARIABLE: el prefijo SALE DE SIESA, no se recorta.
    //
    // Acá había una consulta propia que tomaba CUALQUIER código del
    // producto que empezara con "2" (`.startsWith("codigo_barras","2")
    // .limit(1)`) y le cortaba los primeros 7 caracteres.
    //
    // El prefijo GS1 de báscula es una fila de 7 dígitos con formato
    // `29` + 5 ("2900061"). Pero el rango "2" es el de circulación
    // restringida entero: un pesable puede tener además un EAN-13 propio
    // que arranque en 2. Si Postgres devolvía ESE primero, `substring(0,7)`
    // producía un prefijo INVENTADO — "2001234" de "2001234567890" — con
    // check digit perfectamente calculado sobre una base que no existe.
    // La caja lo rechaza y el error es indistinguible de un código válido.
    //
    // Es el mismo bug que el commit 16c668df mató en el manifiesto. La
    // regla vive en `utils/siesaMatching.js` y ahí se queda: `findGs1Base`
    // exige `/^29\d{5}$/` sobre la fila real, y `buildWeighableCode` arma
    // prefijo(7) + gramos(5) + check(1). No reimplementar acá.
    // ═══════════════════════════════════════════════════════════════
    if (peso_real && peso_real > 0 && f120_id_siesa) {
      const isAlreadyGS1 =
        finalScannedBarcode &&
        finalScannedBarcode.startsWith("2") &&
        (finalScannedBarcode.length === 13 ||
          finalScannedBarcode.length === 14);

      if (!isAlreadyGS1) {
        try {
          // Todas las filas del producto: `findGs1Base` elige la que de
          // verdad es un prefijo de báscula. Filtrar en SQL por "empieza
          // con 2" era justamente lo que dejaba pasar el EAN largo.
          const { data: siesaCodes } = await supabase
            .from("siesa_codigos_barras")
            .select("codigo_barras, f120_id")
            .eq("f120_id", f120_id_siesa);

          const base7 = findGs1Base(siesaCodes || [], f120_id_siesa);
          const gs1 = base7 ? buildWeighableCode(base7, peso_real) : null;

          if (gs1) {
            finalScannedBarcode = gs1;
          } else {
            // Sin prefijo real no se fabrica nada: se deja lo que vino del
            // front para no bloquear al picker. El manifiesto es el que
            // decide si ese código entra al QR — y ahí se verifica contra
            // `siesa_codigos_barras`. Preferimos un ítem reportado a mano
            // antes que un código inventado que falla en la caja.
            console.warn(
              `⚠️ [GS1] Sin prefijo de báscula real (29+5 dígitos) para f120_id ${f120_id_siesa}. No se fabrica código; se conserva "${finalScannedBarcode}".`,
            );
          }
        } catch (err) {
          console.error("Error generando GS1 en backend:", err.message);
        }
      }
    }

    // =================================================================
    // 🛡️ GUARD 1: IDEMPOTENCIA — Ignorar reenvíos de la MISMA acción.
    // Deduplica por action_id (UUID que el picker genera al encolar y que se
    // conserva en los replays de la cola offline). A diferencia del debounce
    // por ventana de tiempo anterior, esto NO descarta unidades legítimas
    // distintas del mismo producto: cada scan trae su propio action_id.
    // Todas las filas de una acción con qty>1 comparten el mismo action_id,
    // así que un replay encuentra las filas existentes y se ignora entero.
    // =================================================================
    if (action_id) {
      const { data: alreadyApplied } = await supabase
        .from("wc_log_picking")
        .select("id")
        .eq("action_id", action_id)
        .limit(1);

      if (alreadyApplied && alreadyApplied.length > 0) {
        console.warn(
          `⚠️ IDEMPOTENCIA: Acción ya aplicada (action_id=${action_id}) — reenvío ignorado`,
        );
        return res.status(200).json({
          success: true,
          message: "Acción ya registrada (idempotente)",
        });
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
      action_id: action_id || null,
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

// ============================================================================
// VALIDACIÓN DE CÓDIGOS CONTRA SIESA — picker y auditor comparten esta función.
//
// Toda la lógica de decisión vive en `utils/siesaMatching.js` (módulo puro,
// con tests de regresión en `utils/siesaMatching.test.js`). Acá solo queda la
// I/O: traer las filas correctas de SIESA y delegar.
//
// Por qué se reescribió (todo esto trababa auditorías sobre productos correctos):
//   · Se consultaba con `.eq(codigo)` crudo → el '+' de SIESA no matcheaba nunca.
//   · Se usaba `.single()` → un código en 2 filas devolvía "no encontrado".
//   · La unidad de medida esperada (una inferencia sobre el nombre del producto)
//     invalidaba códigos correctos.
//   · Un producto sin etiqueta física no tenía NINGÚN camino de validación.
// ============================================================================
async function _validateSiesaCode(
  codigo,
  f120_id_esperado,
  unidad_medida_esperada,
  { allowGS1 = false, umConfiable = null, skuProducto = null, nombreProducto = null } = {},
) {
  const f120Esperado = parseInt(f120_id_esperado, 10);

  if (!isScannableInput(codigo)) {
    return {
      status: 200,
      body: {
        valid: false,
        reason: REASON.MALFORMED,
        message: "❌ Código inválido. Escanea el código de barras del producto.",
        codigo_existe: false,
      },
    };
  }

  // Dos consultas en paralelo, ambas necesarias:
  //   1. Las filas del código escaneado — con y sin '+' (nunca `.single()`).
  //   2. TODAS las filas del producto esperado — hacen falta para el prefijo
  //      GS1, para el SKU+UM y para saber qué presentaciones existen de verdad.
  const variantes = barcodeVariants(codigo);
  const [porCodigo, porProducto] = await Promise.all([
    variantes.length
      ? supabase
          .from("siesa_codigos_barras")
          .select("f120_id, codigo_barras, unidad_medida")
          .in("codigo_barras", variantes)
      : Promise.resolve({ data: [] }),
    !isNaN(f120Esperado)
      ? supabase
          .from("siesa_codigos_barras")
          .select("f120_id, codigo_barras, unidad_medida")
          .eq("f120_id", f120Esperado)
      : Promise.resolve({ data: [] }),
  ]);

  // Unión sin duplicados: una misma fila puede venir por los dos caminos.
  const siesaRows = [];
  const vistos = new Set();
  [...(porCodigo.data || []), ...(porProducto.data || [])].forEach((r) => {
    const k = `${r.f120_id}|${r.codigo_barras}|${r.unidad_medida}`;
    if (vistos.has(k)) return;
    vistos.add(k);
    siesaRows.push(r);
  });

  // ¿La unidad de medida esperada es un DATO o una adivinanza?
  // Si el llamador no lo declara, se deriva acá — y solo se considera
  // confiable cuando hay evidencia real (sufijo del SKU, o SIESA conoce una
  // sola presentación). Ante la duda: NO confiable, o sea NO bloquea.
  let confiable = umConfiable;
  if (confiable === null || confiable === undefined) {
    const resuelta = resolveExpectedUM({
      sku: skuProducto,
      nombre: nombreProducto,
      umsDisponibles: availableUMsFor(siesaRows, f120Esperado),
    });
    confiable =
      resuelta.confiable &&
      normalizeUM(resuelta.um) === normalizeUM(unidad_medida_esperada);
  }

  const resultado = matchScannedCode({
    codigo,
    f120_id_esperado: f120Esperado,
    um_esperada: unidad_medida_esperada,
    umConfiable: confiable,
    siesaRows,
    allowF120Manual: true,
  });

  // Compatibilidad con el frontend actual: los mensajes conservan el emoji.
  const prefijo = resultado.valid ? "✅ " : "❌ ";

  return {
    status: 200,
    body: {
      valid: resultado.valid,
      reason: resultado.reason,
      message: `${prefijo}${resultado.message}`,
      advertencia: resultado.advertencia,
      codigo_existe: resultado.codigo_existe,
      f120_id: resultado.f120_id,
      unidad_medida: resultado.unidad_medida,
      unidad_medida_esperada: normalizeUM(unidad_medida_esperada),
      um_confiable: confiable,
      sku_encontrado: resultado.valid
        ? `${resultado.f120_id}${resultado.unidad_medida || ""}`
        : undefined,
      // Se conserva el shape anterior para no romper pantallas existentes.
      f120_id_coincide: resultado.f120_id_coincide,
      f120_id_encontrado: resultado.f120_id_encontrado,
      unidad_media_encontrada: resultado.unidad_medida_encontrada,
      allowGS1,
    },
  };
}

/**
 * PICKER: Validar código contra SIESA considerando presentaciones
 * Acepta códigos GS1 de peso variable (carnicería: etiquetas de báscula)
 */
exports.validateCodeWithSiesa = async (req, res) => {
  const {
    codigo,
    f120_id_esperado,
    unidad_medida_esperada,
    // Opcionales: permiten decidir si la presentación esperada es un DATO
    // o una inferencia. Si no llegan, el backend lo deriva contra SIESA.
    um_confiable,
    sku_producto,
    nombre_producto,
  } = req.body;

  // `unidad_medida_esperada` ya NO es obligatoria: un producto sin
  // presentación conocida se valida igual por f120_id (antes daba 400 y el
  // picker quedaba sin forma de registrar el ítem).
  if (!codigo || !f120_id_esperado) {
    return res.status(400).json({
      valid: false,
      message: "Parámetros incompletos: se requiere codigo y f120_id_esperado",
    });
  }

  try {
    const result = await _validateSiesaCode(
      codigo,
      f120_id_esperado,
      unidad_medida_esperada,
      {
        allowGS1: true,
        umConfiable: typeof um_confiable === "boolean" ? um_confiable : null,
        skuProducto: sku_producto,
        nombreProducto: nombre_producto,
      },
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
 * Validar código para AUDITOR.
 *
 * Mismo criterio que el picker: el f120_id manda y la presentación solo
 * bloquea cuando es un dato real (ver `utils/siesaMatching.js`). El auditor
 * digita la CANTIDAD a mano; el picker valida unidad por unidad.
 */
exports.validateCodeForAuditor = async (req, res) => {
  const {
    codigo,
    f120_id_esperado,
    unidad_medida_esperada,
    um_confiable,
    sku_producto,
    nombre_producto,
  } = req.body;

  if (!codigo || !f120_id_esperado) {
    return res.status(400).json({
      valid: false,
      message: "Parámetros incompletos: se requiere codigo y f120_id_esperado",
    });
  }

  try {
    const result = await _validateSiesaCode(
      codigo,
      f120_id_esperado,
      unidad_medida_esperada,
      {
        allowGS1: true,
        umConfiable: typeof um_confiable === "boolean" ? um_confiable : null,
        skuProducto: sku_producto,
        nombreProducto: nombre_producto,
      },
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
 * AUDITOR: Cargar todos los codigo_barras para una lista de f120_ids,
 * para que el frontend valide en local sin ida y vuelta por cada scan.
 *
 * Devuelve dos vistas de lo MISMO:
 *   · `barcodeIndex` — código normalizado → LISTA de presentaciones.
 *     Es la buena. Un mismo EAN puede estar registrado para UND y para KL;
 *     el mapa plano anterior era last-wins y perdía la mitad de las filas
 *     en silencio, lo que hacía fallar códigos correctos.
 *   · `barcodeMap` — shape legacy (una presentación por código) para no
 *     romper las pantallas que todavía lo leen. Trae `presentaciones` con
 *     la lista completa. Migrar a `barcodeIndex` y borrar este campo.
 *
 * Las claves están SIEMPRE normalizadas (sin el '+' final de SIESA), porque
 * ningún lector físico emite ese '+'.
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

    const barcodeIndex = buildBarcodeIndex(data || []);

    // Vista legacy + presentaciones completas por código.
    const barcodeMap = {};
    Object.entries(barcodeIndex).forEach(([code, entries]) => {
      barcodeMap[code] = {
        f120_id: entries[0].f120_id,
        unidad_medida: entries[0].unidad_medida,
        presentaciones: entries,
      };
    });

    // Presentaciones reales por producto: el frontend las necesita para
    // saber si la UM que muestra es un dato o una suposición.
    const umsPorProducto = {};
    f120_ids.forEach((id) => {
      const n = parseInt(id, 10);
      if (!isNaN(n)) umsPorProducto[n] = availableUMsFor(data || [], n);
    });

    return res.json({ barcodeIndex, barcodeMap, umsPorProducto });
  } catch (error) {
    console.error("Error en loadBarcodesForAudit:", error.message);
    return res.status(500).json({ error: "Error cargando códigos de barras" });
  }
};
