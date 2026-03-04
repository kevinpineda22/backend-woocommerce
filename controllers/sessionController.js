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

// ✅ HELPER: Obtener códigos de barras desde SIESA (con filtrado inteligente)
async function getBarcodesFromSiesa(productIds) {
  try {
    if (!productIds || productIds.length === 0) return {};

    const { data: barcodes, error } = await supabase
      .from("siesa_codigos_barras")
      .select("f120_id, codigo_barras")
      .in("f120_id", productIds);

    if (error) {
      console.error("Error obteniendo códigos de barras SIESA:", error);
      return {};
    }

    // Agrupar por producto y filtrar códigos válidos
    const barcodesByProduct = {};
    barcodes.forEach((bc) => {
      if (!barcodesByProduct[bc.f120_id]) {
        barcodesByProduct[bc.f120_id] = [];
      }
      barcodesByProduct[bc.f120_id].push(bc.codigo_barras);
    });

    // Seleccionar el mejor código de barras por producto
    const barcodeMap = {};
    Object.keys(barcodesByProduct).forEach((productId) => {
      const codes = barcodesByProduct[productId];

      // Limpiar y filtrar códigos válidos:
      // 1. Preservar '+' del final (algunos productos SIESA lo necesitan en POS)
      // 2. Eliminar códigos que empiecen con 'M' o 'N'
      // 3. Aceptar códigos numéricos puros o numéricos con '+' al final
      const validCodes = codes
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

      // Priorizar EAN-13 (parte numérica = 13 dígitos), luego cualquier código válido
      const ean13 = validCodes.find((c) => c.replace(/\+$/, "").length === 13);
      const firstValid = validCodes[0];

      barcodeMap[productId] = ean13 || firstValid || null;
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

    // Multi-Sede: La sede de la sesión viene del picker, del request, o del pedido
    let sedeId = req.sedeId || pickerData?.sede_id || null;

    // 2. Obtener datos para Snapshot (Multi-sede: usar cliente WC de la sede)
    const sessClient = await getWooClient(sedeId || req.sedeId);
    const pedidosPromesas = ids_pedidos.map((id) =>
      sessClient.get(`orders/${id}`),
    );
    const responses = await Promise.all(pedidosPromesas);

    // Si no tenemos sede del picker, intentar sacarla del primer pedido
    if (!sedeId && responses.length > 0) {
      const { sede_id: orderSedeId } = await getSedeFromWooOrder(
        responses[0].data,
      );
      if (orderSedeId) sedeId = orderSedeId;
    }

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
    await supabase
      .from("wc_pickers")
      .update({ estado_picker: "picking", id_sesion_actual: session.id })
      .eq("id", id_picker);

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
    console.error("Error createSession:", error);
    res.status(500).json({ error: error.message });
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
    const assignIds = assignments.map((a) => a.id);

    // 1. TRAER TODOS LOS LOGS DE ESTA SESIÓN
    const { data: logs } = await supabase
      .from("wc_log_picking")
      .select(
        "id_producto, accion, es_sustituto, nombre_sustituto, precio_nuevo, id_producto_original",
      )
      .in("id_asignacion", assignIds);

    // 2. MAPEO DE CATEGORÍAS
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
        productsData.forEach((p) => {
          mapaCategoriasReales[p.id] = p.categories || [];
        });
      } catch (err) {}
    }

    // ✅ 2B. OBTENER CÓDIGOS DE BARRAS DE SIESA (por SKU, no por product_id)
    const skuList = Array.from(
      new Set(
        itemsAgrupados
          .map((item) => parseInt(item.sku))
          .filter((sku) => !isNaN(sku)),
      ),
    );

    console.log(`🔍 Buscando códigos de barras para ${skuList.length} SKUs`);
    const barcodeMapSiesa = await getBarcodesFromSiesa(skuList);
    console.log(
      "📊 Códigos de barras obtenidos de SIESA:",
      Object.keys(barcodeMapSiesa).length,
    );

    // 3. PROCESAMIENTO DE ESTADO ITEM POR ITEM
    const itemsConRuta = itemsAgrupados.map((item) => {
      const realCategories =
        mapaCategoriasReales[item.product_id] || item.categorias || [];
      const info = obtenerInfoPasillo(realCategories, item.name);

      // 🔍 FILTRO CLAVE: Buscamos logs donde este producto sea el protagonista (original o target)
      // Usamos id_producto_original para no perder el rastro si fue sustituido
      const itemLogs = logs.filter(
        (l) =>
          l.id_producto === item.product_id ||
          l.id_producto_original === item.product_id,
      );

      // Contadores Reales
      const qtyPicked = itemLogs.filter(
        (l) => l.accion === "recolectado",
      ).length;
      const qtySubbed = itemLogs.filter(
        (l) => l.accion === "sustituido",
      ).length;
      const qtyShort = itemLogs.filter(
        (l) => l.accion === "no_encontrado",
      ).length;

      // Datos del sustituto (si existe alguno)
      const lastSub = itemLogs.find((l) => l.accion === "sustituido");

      // Estado Global
      let status = "pendiente";
      const totalProcessed = qtyPicked + qtySubbed + qtyShort;

      if (totalProcessed >= item.quantity_total) status = "recolectado";
      else if (totalProcessed > 0) status = "parcial"; // Opcional, pero útil

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

        // ✅ CÓDIGO DE BARRAS: Prioridad SIESA (por SKU) > WooCommerce > SKU
        barcode:
          barcodeMapSiesa[parseInt(item.sku)] || item.barcode || item.sku,

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

    res.status(200).json({
      session_id: session.id,
      estado: session.estado,
      fecha_inicio: session.fecha_inicio,
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
      })),
      items: itemsConRuta,
    });
  } catch (error) {
    console.error("Error getSession:", error);
    res.status(500).json({ error: "Error al cargar la sesión" });
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
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
  }
};
