const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");
const { obtenerInfoPasillo } = require("../tools/mapeadorPasillos");
const { agruparItemsParaPicking } = require("./pickingUtils");
const {
  getPickerSedeId,
  getSedeFromWooOrder,
} = require("../services/sedeConfig");

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
          if (!cleaned || cleaned.replace(/\+$/, "").length < 8) return false;
          if (
            cleaned.toUpperCase().startsWith("M") ||
            cleaned.toUpperCase().startsWith("N")
          )
            return false;
          // Aceptar dígitos con '+' opcional al final
          return /^\d+\+?$/.test(cleaned);
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
  const { id_picker, ids_pedidos } = req.body;
  try {
    // 1. Obtener Nombre y Sede del Picker
    const { data: pickerData } = await supabase
      .from("wc_pickers")
      .select("nombre_completo, sede_id")
      .eq("id", id_picker)
      .single();
    const nombrePicker = pickerData ? pickerData.nombre_completo : "Picker";

    // Multi-Sede: La sede de la sesión viene del picker, o del request
    let sedeId = req.sedeId || pickerData?.sede_id || null;

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
        customer_note: o.customer_note,
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

    // 4. Actualizar Picker
    const { error: pickerUpdateError } = await supabase
      .from("wc_pickers")
      .update({ estado_picker: "picking", id_sesion_actual: session.id })
      .eq("id", id_picker);

    if (pickerUpdateError) {
      console.error("Error actualizando picker:", pickerUpdateError);
      throw new Error(
        `No se pudo vincular la sesión al picker: ${pickerUpdateError.message}`,
      );
    }

    // 5. Crear Asignaciones (con sede_id)
    const asignaciones = ids_pedidos.map((idPedido) => ({
      id_pedido: idPedido,
      id_picker: id_picker,
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

    res.status(200).json({
      message: "Sesión creada",
      session_id: session.id,
      sede_id: sedeId,
    });
  } catch (error) {
    console.error("Error createSession:", error.message || error);
    res
      .status(500)
      .json({ error: `Error al crear sesión de picking: ${error.message}` });
  }
};

// ✅ LÓGICA CORREGIDA: SPLIT LINE (1 ORIGINAL + 1 SUSTITUTO)
exports.getSessionActive = async (req, res) => {
  const { id_picker, include_removed } = req.query;

  try {
    const { data: picker } = await supabase
      .from("wc_pickers")
      .select("id_sesion_actual")
      .eq("id", id_picker)
      .single();
    if (!picker || !picker.id_sesion_actual)
      return res.status(404).json({ message: "No tienes una sesión activa." });

    const sessionId = picker.id_sesion_actual;
    const { data: session } = await supabase
      .from("wc_picking_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (!session) {
      // Si la sesión fue eliminada manualmente de Supabase, limpiamos el estado del picker
      await supabase
        .from("wc_pickers")
        .update({ id_sesion_actual: null, estado_picker: "disponible" })
        .eq("id", id_picker);

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

    // DEBUG: Ver SKUs de los items agrupados
    console.log("🔍 SKUs de items agrupados:", itemsAgrupados.map(i => ({ name: i.name?.substring(0, 30), sku: i.sku, um: i.unidad_medida })));
    console.log(`🔍 Buscando códigos de barras para ${skuList.length} SKUs`);
    const barcodeMapSiesa = await getBarcodesFromSiesa(skuList);
    console.log(
      "📊 Códigos de barras obtenidos de SIESA:",
      Object.keys(barcodeMapSiesa).length,
    );

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

          console.log(
            "📦 Productos con variaciones detectados:",
            variacionesMap,
          );
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
    const itemsConRuta = itemsAgrupados.map((item) => {
      const realCategories =
        mapaCategoriasReales[item.product_id] || item.categorias || [];
      const info = obtenerInfoPasillo(realCategories, item.name);

      // 🔍 FILTRO CLAVE: Buscamos logs donde este producto sea el protagonista (original o target)
      // Usamos id_producto_original para no perder el rastro si fue sustituido
      // ✅ Usar variation_id para distinguir variaciones del mismo producto padre
      // ✅ FIX: Usar String() para evitar mismatch de tipo (number vs string de Supabase)
      const itemEffectiveId = String(item.variation_id || item.product_id);
      const itemOrderId = item.order_id ? String(item.order_id) : null;
      const itemLogs = logs.filter(
        (l) => {
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
        }
      );

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
        total: o.total,
        customer_note: o.customer_note || null,
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
    await supabase
      .from("wc_picking_sessions")
      .update({ estado: "pendiente_auditoria", fecha_fin: now })
      .eq("id", id_sesion);

    // [INSTRUCCION 2026-02-13] Se comenta para que el picker NO se libere aquí.
    // El picker seguirá en session_actual hasta que el Auditor lo libere en Dashboard.
    /*
    await supabase
      .from("wc_pickers")
      .update({ estado_picker: "disponible", id_sesion_actual: null })
      .eq("id", id_picker); 
    */

    await supabase
      .from("wc_asignaciones_pedidos")
      .update({ estado_asignacion: "completado", fecha_fin: now })
      .eq("id_sesion", id_sesion);
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
    const { data: pickerData } = await supabase
      .from("wc_pickers")
      .select("id_sesion_actual")
      .eq("id", id_picker)
      .single();
    if (!pickerData || !pickerData.id_sesion_actual) {
      await supabase
        .from("wc_pickers")
        .update({ estado_picker: "disponible", id_sesion_actual: null })
        .eq("id", id_picker);
      return res.status(200).json({ message: "Picker liberado." });
    }
    const idSesion = pickerData.id_sesion_actual;
    const now = new Date().toISOString();

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
      .eq("id", id_picker);

    res.status(200).json({ message: "Sesión cancelada." });
  } catch (error) {
    console.error("Error cancelAssignment:", error.message || error);
    res
      .status(500)
      .json({ error: `Error al cancelar asignación: ${error.message}` });
  }
};
