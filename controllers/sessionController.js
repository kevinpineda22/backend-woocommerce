const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");
const { obtenerInfoPasillo } = require("../tools/mapeadorPasillos");
const { agruparItemsParaPicking } = require("./pickingUtils");
const {
  getPickerSedeId,
  getSedeFromWooOrder,
  getSedeById,
} = require("../services/sedeConfig");
const { logAuditEvent } = require("../services/auditService");
const { calcLineCharge } = require("../utils/manifestPricing");
// Criterio único de "qué falta por hacer" en una sesión. Tiene que coincidir
// con lo que cuenta la pantalla del picker; ver utils/pendingItems.js.
const { findPendingItems } = require("../utils/pendingItems");

// Multi-sede WooCommerce (WordPress Multisite)
const { getWooClient } = require("../services/wooMultiService");

// ✅ HELPER: Obtener códigos de barras desde SIESA (con filtrado por unidad_medida)
async function getBarcodesFromSiesa(productIds) {
  try {
    if (!productIds || productIds.length === 0) return {};

    const { data: barcodes, error } = await supabase
      .from("siesa_codigos_barras")
      .select("f120_id, codigo_barras, unidad_medida")
      .in("f120_id", productIds);

    if (error) {
      console.error("Error obteniendo códigos de barras SIESA:", error);
      return {};
    }

    // ✅ Agrupar por f120_id + unidad_medida para no mezclar presentaciones
    // Estructura: { f120_id: { unidad_medida: [barcodes], _all: [todos] } }
    const barcodesByProduct = {};
    barcodes.forEach((bc) => {
      if (!barcodesByProduct[bc.f120_id]) {
        barcodesByProduct[bc.f120_id] = { _all: [] };
      }
      const um = (bc.unidad_medida || "_unknown").toUpperCase();
      if (!barcodesByProduct[bc.f120_id][um]) {
        barcodesByProduct[bc.f120_id][um] = [];
      }
      barcodesByProduct[bc.f120_id][um].push(bc.codigo_barras);
      barcodesByProduct[bc.f120_id]._all.push(bc.codigo_barras);
    });

    // Filtrar códigos válidos por grupo
    const filterValidCodes = (codes) => {
      return codes
        .map((code) => (code || "").toString().trim())
        .filter((cleaned) => {
          const stripped = cleaned.replace(/\+$/, "");
          if (!stripped || stripped.length < 4) return false;
          if (/^[MN]\d/i.test(stripped)) return false;
          // Aceptar dígitos puros, dígitos+UM (ej: 185325P25), dígitos con '+' al final
          return /^\d+([A-Z]*\d*)?\+?$/i.test(cleaned);
        });
    };

    // Construir mapa final con códigos filtrados
    const barcodeMap = {};
    Object.keys(barcodesByProduct).forEach((productId) => {
      const groups = barcodesByProduct[productId];
      barcodeMap[productId] = {};
      Object.keys(groups).forEach((um) => {
        const valid = filterValidCodes(groups[um]);
        if (valid.length > 0) {
          barcodeMap[productId][um] = valid;
        }
      });
    });

    return barcodeMap;
  } catch (error) {
    console.error("Error en getBarcodesFromSiesa:", error);
    return {};
  }
}

exports.createPickingSession = async (req, res) => {
  const { id_picker, picker_email, ids_pedidos, admin_name, admin_email } =
    req.body;
  try {
    // 1. Obtener Nombre y Sede del Picker (Priorizar búsqueda por Email para evitar desajustes de ID)
    let pickerQuery = supabase
      .from("wc_pickers")
      .select("id, nombre_completo, sede_id, email");

    if (picker_email) {
      pickerQuery = pickerQuery.eq("email", picker_email.toLowerCase().trim());
    } else if (id_picker && id_picker.includes("@")) {
      // Fallback si mandan el email en el campo id_picker
      pickerQuery = pickerQuery.eq("email", id_picker.toLowerCase().trim());
    } else {
      pickerQuery = pickerQuery.eq("id", id_picker);
    }

    const { data: pickerData, error: pickerError } = await pickerQuery.single();

    if (pickerError || !pickerData) {
      throw new Error(
        "No se encontró el picker operativo con el identificador proporcionado.",
      );
    }

    const nombrePicker = pickerData.nombre_completo || "Picker";
    const targetPickerId = pickerData.id; // El ID real en la tabla wc_pickers
    const targetPickerEmail = pickerData.email;

    // Multi-Sede: La sede de la sesión viene del picker, o del request
    let sedeId = req.sedeId || pickerData?.sede_id || null;

    // VALIDACIÓN: Límite de 10 pedidos activos
    const { data: activeAssignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id")
      .eq("id_picker", targetPickerId)
      .eq("estado_asignacion", "en_proceso");

    const currentCount = activeAssignments ? activeAssignments.length : 0;
    if (currentCount + ids_pedidos.length > 10) {
      throw new Error(
        `El picker ya tiene ${currentCount} pedidos activos. No puede exceder el límite de 10 (intentó asignar ${ids_pedidos.length} nuevos).`
      );
    }

    // ✅ GUARD ANTI-SOBREESCRITURA: Verificar que el picker no tenga ya una
    // sesión activa (id_sesion_actual apuntando a una sesión en_proceso).
    // Antes esto se sobreescribía silenciosamente, dejando la sesión anterior
    // huérfana (activa pero sin picker referenciándola).
    if (pickerData.id_sesion_actual) {
      const { data: existingSession } = await supabase
        .from("wc_picking_sessions")
        .select("estado")
        .eq("id", pickerData.id_sesion_actual)
        .single();

      if (existingSession && existingSession.estado === "en_proceso") {
        throw new Error(
          `El picker ya tiene una sesión activa (#${pickerData.id_sesion_actual.slice(0, 6)}). Finalícela o cancélela antes de crear una nueva.`
        );
      }

      if (existingSession) {
        console.warn(
          `⚠️ Sobrescribiendo id_sesion_actual del picker ${targetPickerId}: ` +
          `la sesión anterior (#${pickerData.id_sesion_actual.slice(0, 6)}) estaba en estado "${existingSession.estado}" (no activa).`,
        );
      }
    }

    let sessClient;
    let responses;

    // Si no tenemos sede desde el picker/request, buscamos en qué sede existe el primer pedido
    if (!sedeId && ids_pedidos.length > 0) {
      const { getOrderFromAnySede } = require("../services/wooMultiService");
      const foundSede = await getOrderFromAnySede(ids_pedidos[0]);
      if (foundSede && foundSede.sedeId) {
        sedeId = foundSede.sedeId;
      }
    }

    // 2. Obtener datos para Snapshot (Multi-sede: usar cliente WC de la sede)
    sessClient = await getWooClient(sedeId);

    const pedidosPromesas = ids_pedidos.map((id) =>
      sessClient.get(`orders/${id}`).catch((err) => {
        console.error(
          `Error buscando pedido ${id} en sede ${sedeId}:`,
          err.message,
        );
        throw new Error(
          `El pedido ${id} no existe o no se pudo cargar desde WooCommerce.`,
        );
      }),
    );

    responses = await Promise.all(pedidosPromesas);

    const snapshotPedidos = responses.map((r) => {
      const o = r.data;
      return {
        id: o.id,
        status: o.status,
        date_created: o.date_created,
        total: o.total,
        billing: o.billing,
        shipping: o.shipping,
        shipping_lines: o.shipping_lines || [],
        customer_note: o.customer_note,
        payment_method: o.payment_method || "",
        payment_method_title: o.payment_method_title || "",
        meta_data: o.meta_data || [],
        line_items: o.line_items.map((item) => ({
          ...item,
          is_removed: false,
        })),
      };
    });

    // 3. Insertar Sesión (con sede_id)
    const { data: session, error: sessError } = await supabase
      .from("wc_picking_sessions")
      .insert([
        {
          id_picker,
          ids_pedidos,
          estado: "en_proceso",
          fecha_inicio: new Date().toISOString(),
          snapshot_pedidos: snapshotPedidos,
          sede_id: sedeId, // ✅ MULTI-SEDE
        },
      ])
      .select()
      .single();

    if (sessError) throw sessError;

    // 4. Actualizar Picker (Usar el ID real resuelto)
    const { error: pickerUpdateError } = await supabase
      .from("wc_pickers")
      .update({ estado_picker: "picking", id_sesion_actual: session.id })
      .eq("id", targetPickerId);

    if (pickerUpdateError) {
      console.error("Error actualizando picker:", pickerUpdateError);
      throw new Error(
        `No se pudo vincular la sesión al picker: ${pickerUpdateError.message}`,
      );
    }

    // 5. Crear Asignaciones (con sede_id y usando el ID real resuelto)
    const asignaciones = ids_pedidos.map((idPedido) => ({
      id_pedido: idPedido,
      id_picker: targetPickerId,
      id_sesion: session.id,
      nombre_picker: nombrePicker,
      reporte_snapshot: snapshotPedidos.find((s) => s.id === idPedido),
      estado_asignacion: "en_proceso",
      fecha_inicio: new Date().toISOString(),
      sede_id: sedeId, // ✅ MULTI-SEDE
    }));

    const { error: assignError } = await supabase
      .from("wc_asignaciones_pedidos")
      .insert(asignaciones);
    if (assignError) throw assignError;

    logAuditEvent({
      actor: {
        type: "admin",
        id: admin_email || null,
        name: (admin_name || "").trim() || "Admin",
      },
      action: "session.created",
      entity: { type: "session", id: session.id },
      sedeId,
      metadata: {
        picker_id: targetPickerId,
        picker_email: targetPickerEmail,
        picker_name: nombrePicker,
        orders: ids_pedidos,
      },
    });

    res.status(200).json({
      message: "Sesión creada",
      session_id: session.id,
      sede_id: sedeId,
      picker_id: targetPickerId,
    });
  } catch (error) {
    console.error("Error createSession:", error.message || error);
    res
      .status(500)
      .json({ error: `Error al crear sesión de picking: ${error.message}` });
  }
};

// ✅ LÓGICA CORREGIDA: Resolución flexible de Picker (Email/ID)
exports.getSessionActive = async (req, res) => {
  const { id_picker, include_removed, session_id } = req.query;

  try {
    let sessionId;
    let targetPickerId = null;

    // ✅ MODO DIRECTO (admin "ver detalles en vivo"): cargar la sesión por su
    // propio ID. Evita el 404 de "sesiones fantasma" — sesiones que siguen en
    // estado en_proceso pero que el picker ya no tiene como id_sesion_actual.
    // Antes resolvíamos SIEMPRE por el picker, así que una sesión huérfana era
    // imposible de abrir desde el panel aunque siguiera apareciendo en la lista.
    if (session_id) {
      sessionId = session_id;
    } else {
      // 1. MODO PICKER (app del picker): resolver la sesión actual del picker.
      let pickerQuery = supabase
        .from("wc_pickers")
        .select("id, id_sesion_actual");

      if (id_picker && id_picker.includes("@")) {
        pickerQuery = pickerQuery.eq("email", id_picker.toLowerCase().trim());
      } else {
        pickerQuery = pickerQuery.eq("id", id_picker);
      }

      const { data: picker, error: pError } = await pickerQuery.single();

      if (pError || !picker || !picker.id_sesion_actual)
        return res
          .status(404)
          .json({ message: "No tienes una sesión activa." });

      sessionId = picker.id_sesion_actual;
      targetPickerId = picker.id;
    }

    const { data: session } = await supabase
      .from("wc_picking_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (!session) {
      // Si la sesión fue eliminada manualmente de Supabase, limpiamos el estado
      // del picker (solo en modo picker; en modo directo no hay picker que tocar).
      if (targetPickerId) {
        await supabase
          .from("wc_pickers")
          .update({ id_sesion_actual: null, estado_picker: "disponible" })
          .eq("id", targetPickerId);
      }

      return res
        .status(404)
        .json({ message: "La sesión asignada ya no existe." });
    }

    // Obtener órdenes (Snapshot o Woo)
    let orders =
      session.snapshot_pedidos && session.snapshot_pedidos.length > 0
        ? session.snapshot_pedidos
        : await (async () => {
            // Multi-sede: usar el cliente WC de la sede de la sesión
            const activeClient = await getWooClient(session.sede_id);
            const results = await Promise.all(
              session.ids_pedidos.map((id) => activeClient.get(`orders/${id}`)),
            );
            return results.map((r) => r.data);
          })();

    const allItems = agruparItemsParaPicking(orders);

    let itemsAgrupados;
    if (include_removed === "true") {
      itemsAgrupados = allItems.filter(
        (item) => item.quantity_total > 0 || item.is_removed,
      );
    } else {
      itemsAgrupados = allItems.filter(
        (item) => !item.is_removed && item.quantity_total > 0,
      );
    }

    const { data: assignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id")
      .eq("id_sesion", sessionId);
    const assignIds = assignments ? assignments.map((a) => a.id) : [];

    // 1. TRAER TODOS LOS LOGS DE ESTA SESIÓN
    const { data: logsData, error: logsError } = await supabase
      .from("wc_log_picking")
      .select(
        "id_producto, accion, es_sustituto, nombre_sustituto, precio_nuevo, id_producto_original, peso_real, fecha_registro, id_pedido",
      )
      .in("id_asignacion", assignIds)
      .order("fecha_registro", { ascending: true });

    if (logsError) {
      console.error("Error obteniendo logs de picking:", logsError);
    }

    const logs = logsData || [];

    // 2. MAPEO DE CATEGORÍAS (CON JERARQUÍA)
    const productIds = itemsAgrupados.map((i) => i.product_id);
    const mapaCategoriasReales = {};

    if (productIds.length > 0) {
      try {
        // Multi-sede: usar cliente WC de la sede de la sesión
        const catClient = await getWooClient(session.sede_id);
        const { data: productsData } = await catClient.get("products", {
          include: productIds.join(","),
          per_page: 100,
          _fields: "id,categories",
        });

        // Extraer todos los IDs de categorías para buscar su jerarquía
        const categoryIdsToFetch = new Set();
        productsData.forEach((p) => {
          if (p.categories) {
            p.categories.forEach((c) => categoryIdsToFetch.add(c.id));
          }
        });

        const categoryHierarchyMap = {};
        if (categoryIdsToFetch.size > 0) {
          // Obtener los datos completos de las categorías (incluyendo 'parent')
          const { data: categoriesData } = await catClient.get(
            "products/categories",
            {
              include: Array.from(categoryIdsToFetch).join(","),
              per_page: 100,
              _fields: "id,name,parent",
            },
          );
          categoriesData.forEach((c) => {
            categoryHierarchyMap[c.id] = c;
          });
        }

        // Enriquecer las categorías del producto con la bandera 'parent'
        productsData.forEach((p) => {
          if (p.categories) {
            mapaCategoriasReales[p.id] = p.categories.map((c) => ({
              ...c,
              parent: categoryHierarchyMap[c.id]
                ? categoryHierarchyMap[c.id].parent
                : 0,
            }));
          } else {
            mapaCategoriasReales[p.id] = [];
          }
        });
      } catch (err) {
        console.error(
          "Error obteniendo categorías/productos de WC:",
          err.message,
        );
      }
    }

    // ✅ 2B. OBTENER CÓDIGOS DE BARRAS DE SIESA (por SKU, no por product_id)
    const skuList = Array.from(
      new Set(
        itemsAgrupados
          .map((item) => parseInt(item.sku))
          .filter((sku) => !isNaN(sku)),
      ),
    );

    const barcodeMapSiesa = await getBarcodesFromSiesa(skuList);

    // ✅ 2C. DETECTAR PRODUCTOS CON VARIACIONES (múltiples unidad_medida)
    const f120IdList = Array.from(
      new Set(
        skuList.map((sku) => sku), // Ya son los f120_ids extraídos
      ),
    );

    const variacionesMap = {};
    if (f120IdList.length > 0) {
      try {
        const { data: variacionesData } = await supabase
          .from("siesa_codigos_barras")
          .select("f120_id, unidad_medida")
          .in("f120_id", f120IdList);

        if (variacionesData) {
          // Agrupar por f120_id y contar unidad_medida únicas
          variacionesData.forEach((row) => {
            if (!variacionesMap[row.f120_id]) {
              variacionesMap[row.f120_id] = new Set();
            }
            variacionesMap[row.f120_id].add(row.unidad_medida);
          });

          // Convertir Set a boolean: true si tiene más de 1 variación
          Object.keys(variacionesMap).forEach((f120_id) => {
            variacionesMap[f120_id] = variacionesMap[f120_id].size > 1;
          });
        }
      } catch (e) {
        console.error("Error detectando variaciones:", e.message);
      }
    }

    // ✅ HELPER: Extraer unidad_medida del SKU (ej: "11420P6" → "P6", "11420UND" → "UND")
    const parseSkuPresentation = (sku) => {
      if (!sku) return null;
      const cleaned = sku.toString().replace(/-/g, "").trim();
      const match = cleaned.match(/^\d+([A-Z]+\d*)$/i);
      return match ? match[1].toUpperCase() : null;
    };

    // 3. PROCESAMIENTO DE ESTADO ITEM POR ITEM
    // Multi-sede: obtener slug para mapeo de pasillos correcto
    const sedeData = await getSedeById(session.sede_id);
    const sedeSlug = sedeData?.slug || "";

    const itemsConRuta = itemsAgrupados.map((item) => {
      const realCategories =
        mapaCategoriasReales[item.product_id] || item.categorias || [];
      const info = obtenerInfoPasillo(realCategories, item.name, sedeSlug);

      // 🔍 FILTRO CLAVE: Buscamos logs donde este producto sea el protagonista (original o target)
      // Usamos id_producto_original para no perder el rastro si fue sustituido
      // ✅ Usar variation_id para distinguir variaciones del mismo producto padre
      // ✅ FIX: Usar String() para evitar mismatch de tipo (number vs string de Supabase)
      const itemEffectiveId = String(item.variation_id || item.product_id);
      const itemOrderId = item.order_id ? String(item.order_id) : null;
      const itemLogs = logs.filter((l) => {
        // ✅ Si el item tiene order_id, solo aceptar logs de ESE pedido
        if (itemOrderId && l.id_pedido && String(l.id_pedido) !== itemOrderId) {
          return false;
        }
        return (
          String(l.id_producto) === itemEffectiveId ||
          String(l.id_producto_original) === itemEffectiveId ||
          // Fallback para logs antiguos que usaban product_id sin variation_id
          (!item.variation_id &&
            (String(l.id_producto) === String(item.product_id) ||
              String(l.id_producto_original) === String(item.product_id)))
        );
      });

      // Contadores Reales
      const pickedLogs = itemLogs.filter((l) => l.accion === "recolectado");
      const qtyPicked = pickedLogs.length;
      const qtySubbed = itemLogs.filter(
        (l) => l.accion === "sustituido",
      ).length;
      const qtyShort = itemLogs.filter(
        (l) => l.accion === "no_encontrado",
      ).length;

      // Peso real acumulado (suma de todos los logs de recolección con peso)
      const pesoRealTotal = pickedLogs.reduce(
        (sum, l) => sum + (parseFloat(l.peso_real) || 0),
        0,
      );

      // Datos del sustituto (si existe alguno)
      const lastSub = itemLogs.find((l) => l.accion === "sustituido");

      // Último reporte de "no encontrado" (para mostrar el motivo al admin)
      const lastNotFound = itemLogs.find((l) => l.accion === "no_encontrado");

      // SKU y f120_id desde el SKU original de WooCommerce
      let skuFinal = item.sku;
      let f120_idFinal = parseInt(item.sku);

      // ✅ DETECTAR SI PRODUCTO TIENE VARIACIONES
      const tieneVariaciones = variacionesMap[f120_idFinal] || false;

      // Estado Global
      let status = "pendiente";
      const totalProcessed = qtyPicked + qtySubbed + qtyShort;

      if (totalProcessed >= item.quantity_total) {
        if (qtySubbed >= item.quantity_total) status = "sustituido";
        // ✅ Ítem resuelto SIN llevar nada: el picker reportó que no hay.
        // Estado propio para que picker, admin y auditor lo distingan de un
        // "recolectado" real (antes caía en recolectado y se perdía el matiz).
        else if (qtyShort >= item.quantity_total) status = "no_encontrado";
        else status = "recolectado";
      } else if (totalProcessed > 0) {
        status = "parcial";
      }

      // ✅ PRESENTACIÓN: Extraer del SKU (P6, UND, KL, LB, etc.)
      // Solo sobreescribir si el item NO tiene ya unidad_medida del meta de WooCommerce
      const skuPresentation = parseSkuPresentation(item.sku);
      const unidadMedidaFinal = item.unidad_medida || skuPresentation || null;

      return {
        ...item,
        pasillo: info.pasillo,
        prioridad: info.prioridad,
        categorias_reales: realCategories
          .map((c) => c.name)
          .filter((n) => n !== "Uncategorized"),

        status: status,

        // 👉 ESTA ES LA MAGIA: Enviamos qty_scanned como solo los originales
        // El frontend calculará (Total - Originales) para saber cuántos son sustitutos
        qty_scanned: qtyPicked,
        peso_real: pesoRealTotal > 0 ? parseFloat(pesoRealTotal.toFixed(3)) : 0,

        // ✅ Unidades que el picker reportó como NO ENCONTRADAS (y su motivo)
        qty_no_encontrada: qtyShort,
        motivo_no_encontrado: lastNotFound?.motivo || null,

        // ✅ SKU FINAL: Reconstruido desde SIESA si está disponible
        sku_final: skuFinal,

        // ✅ PRESENTACIÓN: P6 → SIXPACK, P2 → DÚO, UND → Unidad, KL → Kilo, etc.
        unidad_medida: unidadMedidaFinal,

        // ✅ NUEVO: Indica si el producto tiene variaciones (múltiples unidad_medida)
        tiene_variaciones: tieneVariaciones,

        // ✅ CÓDIGOS DE BARRAS: Filtrados por unidad_medida para no mezclar presentaciones
        barcode: (() => {
          const f120 = parseInt(item.sku);
          const siesaGroup = barcodeMapSiesa[f120];
          if (!siesaGroup) return [item.barcode || item.sku];
          // Intentar buscar barcodes de la presentación exacta (P6, UND, KL, etc.)
          let um = (unidadMedidaFinal || "").toUpperCase();
          if (um === "UN" || um === "UNIDAD") um = "UND";
          else if (um === "KG" || um === "KILO") um = "KL";

          if (um) {
            // REGLA ESTRICTA: No fallback a _all si tiene unidad
            return siesaGroup[um] || [item.barcode || item.sku];
          }
          // Fallback: todos los barcodes válidos si no tiene presentación
          return siesaGroup._all || [item.barcode || item.sku];
        })(),

        sustituto: lastSub
          ? {
              name: lastSub.nombre_sustituto,
              price: lastSub.precio_nuevo,
              qty: qtySubbed,
            }
          : null,
      };
    });

    itemsConRuta.sort((a, b) => a.prioridad - b.prioridad);

    // Tiempo real de inicio de picking (primer log de acción válida)
    const validPickActions = ["recolectado", "sustituido", "no_encontrado"];
    const firstPickLog = logs
      .filter((l) => validPickActions.includes(l.accion))
      .sort(
        (a, b) => new Date(a.fecha_registro) - new Date(b.fecha_registro),
      )[0];
    const pickingStartTime = firstPickLog?.fecha_registro || null;

    res.status(200).json({
      session_id: session.id,
      estado: session.estado,
      fecha_inicio: session.fecha_inicio,
      picking_start_time: pickingStartTime,
      active_assignments_ids: assignIds,
      orders_info: orders.map((o) => ({
        id: o.id,
        customer: o.billing
          ? `${o.billing.first_name} ${o.billing.last_name}`
          : "Cliente",
        phone: o.billing?.phone,
        email: o.billing?.email,
        billing: o.billing,
        shipping: o.shipping,
        items: o.line_items || [],
        total: (() => {
          const productItems = (o.line_items || o.items || []).filter(
            (i) => !i.is_shipping_method && !i.is_removed,
          );
          const itemsTotal = productItems.reduce(
            (sum, item) => sum + calcLineCharge(item),
            0,
          );
          const shippingTotal = (o.shipping_lines || []).reduce(
            (sum, s) => sum + (parseFloat(s.total) || 0),
            0,
          );
          const calculatedTotal = itemsTotal + shippingTotal;
          const wooOrderTotal = parseFloat(o.total) || 0;
          if (
            Math.abs(calculatedTotal - wooOrderTotal) > 1 &&
            calculatedTotal > 0
          )
            return calculatedTotal;
          return wooOrderTotal > 0 ? wooOrderTotal : calculatedTotal || null;
        })(),
        customer_note: o.customer_note || null,
        payment_method_title: o.payment_method_title || "",
        meta_data: o.meta_data || [],
      })),
      items: itemsConRuta,
    });
  } catch (error) {
    console.error("Error getSession:", error.message || error);
    res.status(500).json({
      error: `Error al cargar la sesión activa: ${error.message || "No se pudo recuperar la información"}`,
    });
  }
};

exports.completeSession = async (req, res) => {
  const { id_sesion, id_picker } = req.body;
  try {
    const now = new Date().toISOString();

    // Resolver Picker Operativo
    let pickerQuery = supabase.from("wc_pickers").select("id, nombre_completo");
    if (id_picker && id_picker.includes("@")) {
      pickerQuery = pickerQuery.eq("email", id_picker.toLowerCase().trim());
    } else {
      pickerQuery = pickerQuery.eq("id", id_picker);
    }
    const { data: pickerRow } = await pickerQuery.single();
    const targetPickerId = pickerRow?.id || id_picker;
    const pickerName = pickerRow?.nombre_completo || "Picker";

    const { data: sessData } = await supabase
      .from("wc_picking_sessions")
      .select("sede_id, ids_pedidos, snapshot_pedidos")
      .eq("id", id_sesion)
      .single();

    if (!sessData) throw new Error("Sesión no encontrada");

    // ✅ VALIDACIÓN ESTRICTA: No permitir finalizar si hay pendientes.
    //
    // El criterio vive en utils/pendingItems.js (puro, con tests) porque tiene
    // que contar EXACTAMENTE lo mismo que la pantalla del picker. Cuando las
    // dos cuentas divergen el picker queda encerrado: la app le muestra 29/29
    // y el botón le responde que faltan productos, sin decirle cuáles.
    //
    // Eso pasaba con los ítems retirados por el admin: `removeItemFromSession`
    // marca `is_removed` en TODOS los pedidos del snapshot pero deja el log
    // `eliminado_admin` colgado de UN solo pedido, y acá los logs se filtraban
    // por `id_pedido`. En multipicking, el resto de los pedidos veía un
    // pendiente fantasma que no había forma de resolver desde la app.
    const { data: assignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, id_pedido")
      .eq("id_sesion", id_sesion);

    const assignIds = (assignments || []).map((a) => a.id);
    const { data: logs, error: logsError } = await supabase
      .from("wc_log_picking")
      .select("id_producto, id_producto_original, accion, id_pedido")
      .in("id_asignacion", assignIds);

    // Sin los logs no se puede distinguir un ítem sin procesar de uno ya
    // recolectado: bloquear a ciegas dejaría al picker sin salida.
    if (logsError) {
      throw new Error(
        `No se pudieron leer los registros de picking: ${logsError.message}`,
      );
    }

    const { pendientes, resumen } = findPendingItems({
      snapshotOrders: sessData.snapshot_pedidos || [],
      logs: logs || [],
    });

    if (pendientes.length > 0) {
      const details = pendientes.map((p) => `${p.name} (#${p.order_id})`);
      console.warn(
        `⛔ [CIERRE] Sesión ${id_sesion} bloqueada: ${pendientes.length} pendiente(s) de ${resumen.total} ítems (${resumen.retirados} retirados por admin). ${details.join(" | ")}`,
      );
      return res.status(400).json({
        error:
          "No puedes finalizar la sesión. Aún tienes productos pendientes.",
        details,
        resumen,
      });
    }

    await supabase
      .from("wc_picking_sessions")
      .update({ estado: "pendiente_auditoria", fecha_fin: now })
      .eq("id", id_sesion);

    await supabase
      .from("wc_asignaciones_pedidos")
      .update({ estado_asignacion: "completado", fecha_fin: now })
      .eq("id_sesion", id_sesion);

    // ✅ Liberar picker: sin esto, id_sesion_actual queda apuntando a una
    // sesión ya completada, lo que impide que el picker tome una nueva
    // y, peor aún, si se crea una nueva sesión se sobreescribe el puntero
    // dejando la anterior huérfana (id_sesion_actual = NULL con sesión activa).
    if (targetPickerId) {
      await supabase
        .from("wc_pickers")
        .update({ estado_picker: "disponible", id_sesion_actual: null })
        .eq("id", targetPickerId);
    }

    logAuditEvent({
      actor: { type: "picker", id: targetPickerId, name: pickerName },
      action: "session.completed",
      entity: { type: "session", id: id_sesion },
      sedeId: sessData?.sede_id || req.sedeId || null,
      metadata: {
        orders: sessData?.ids_pedidos || [],
        picker_name: pickerName,
      },
    });

    res
      .status(200)
      .json({ message: "Sesión finalizada. Esperando auditoría." });
  } catch (error) {
    console.error("Error completeSession:", error.message || error);
    res
      .status(500)
      .json({ error: `Error al finalizar sesión: ${error.message}` });
  }
};

exports.cancelAssignment = async (req, res) => {
  const { id_picker } = req.body;
  try {
    // Resolver Picker Operativo
    let pickerQuery = supabase
      .from("wc_pickers")
      .select("id, nombre_completo, id_sesion_actual");
    if (id_picker && id_picker.includes("@")) {
      pickerQuery = pickerQuery.eq("email", id_picker.toLowerCase().trim());
    } else {
      pickerQuery = pickerQuery.eq("id", id_picker);
    }
    const { data: pickerData } = await pickerQuery.single();

    if (!pickerData || !pickerData.id_sesion_actual) {
      if (pickerData) {
        await supabase
          .from("wc_pickers")
          .update({ estado_picker: "disponible", id_sesion_actual: null })
          .eq("id", pickerData.id);
      }
      return res.status(200).json({ message: "Picker liberado." });
    }

    const idSesion = pickerData.id_sesion_actual;
    const targetPickerId = pickerData.id;
    const cancelPickerName = pickerData.nombre_completo || "Picker";
    const now = new Date().toISOString();

    const { data: sessSede } = await supabase
      .from("wc_picking_sessions")
      .select("sede_id, ids_pedidos")
      .eq("id", idSesion)
      .single();

    await supabase
      .from("wc_picking_sessions")
      .update({ estado: "cancelado", fecha_fin: now })
      .eq("id", idSesion);
    await supabase
      .from("wc_asignaciones_pedidos")
      .update({ estado_asignacion: "cancelado", fecha_fin: now })
      .eq("id_sesion", idSesion);
    await supabase
      .from("wc_pickers")
      .update({ estado_picker: "disponible", id_sesion_actual: null })
      .eq("id", targetPickerId);

    logAuditEvent({
      actor: { type: "picker", id: targetPickerId, name: cancelPickerName },
      action: "session.cancelled",
      entity: { type: "session", id: idSesion },
      sedeId: sessSede?.sede_id || req.sedeId || null,
      metadata: {
        orders: sessSede?.ids_pedidos || [],
        picker_name: cancelPickerName,
      },
    });

    res.status(200).json({ message: "Sesión cancelada." });
  } catch (error) {
    console.error("Error cancelAssignment:", error.message || error);
    res
      .status(500)
      .json({ error: `Error al cancelar asignación: ${error.message}` });
  }
};

// ✅ ADMIN CANCEL SESSION: Revertir sesión por session_id (no por picker)
// El frontend (ActiveSessionsView) usa este endpoint para que el admin pueda
// cancelar incluso sesiones huérfanas donde id_sesion_actual = NULL pero la
// sesión sigue activa (estado = en_proceso).
exports.adminCancelSession = async (req, res) => {
  const { session_id, motivo, admin_name, admin_email } = req.body;

  try {
    if (!session_id) return res.status(400).json({ error: "Falta session_id" });

    const now = new Date().toISOString();

    // 1. Obtener la sesión
    const { data: session, error: sessError } = await supabase
      .from("wc_picking_sessions")
      .select("id, id_picker, ids_pedidos, sede_id")
      .eq("id", session_id)
      .single();

    if (sessError || !session) throw new Error("Sesión no encontrada");

    // 2. Nombre del picker para auditoría
    let pickerName = null;
    if (session.id_picker) {
      const { data: pickerRow } = await supabase
        .from("wc_pickers")
        .select("nombre_completo")
        .eq("id", session.id_picker)
        .single();
      pickerName = pickerRow?.nombre_completo || null;
    }

    // 3. Cancelar sesión
    await supabase
      .from("wc_picking_sessions")
      .update({ estado: "cancelado", fecha_fin: now })
      .eq("id", session_id);

    // 4. Cancelar asignaciones
    await supabase
      .from("wc_asignaciones_pedidos")
      .update({ estado_asignacion: "cancelado", fecha_fin: now })
      .eq("id_sesion", session_id);

    // 5. Liberar picker (si tiene)
    if (session.id_picker) {
      await supabase
        .from("wc_pickers")
        .update({ estado_picker: "disponible", id_sesion_actual: null })
        .eq("id", session.id_picker);
    }

    // 6. Audit log
    logAuditEvent({
      actor: {
        type: "admin",
        id: admin_email || null,
        name: (admin_name || "").trim() || "Admin",
      },
      action: "session.cancelled",
      entity: { type: "session", id: session_id },
      sedeId: session?.sede_id || req.sedeId || null,
      metadata: {
        orders: session?.ids_pedidos || [],
        picker_name: pickerName,
        motivo: (motivo || "").trim() || null,
      },
    });

    console.log(
      `🗑️ [ADMIN] Sesión #${session_id} cancelada por ${admin_name || "Admin"}${motivo ? ` — Motivo: ${motivo}` : ""}`,
    );

    res.status(200).json({ message: "Sesión cancelada correctamente." });
  } catch (error) {
    console.error("Error adminCancelSession:", error.message || error);
    res
      .status(500)
      .json({ error: `Error al cancelar sesión: ${error.message}` });
  }
};
