const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");
const { obtenerInfoPasillo } = require("../tools/mapeadorPasillos");
const { agruparItemsParaPicking } = require("./pickingUtils");

exports.createPickingSession = async (req, res) => {
  const { id_picker, ids_pedidos } = req.body;
  try {
    // 1. Obtener Nombre Picker
    const { data: pickerData } = await supabase
        .from("wc_pickers")
        .select("nombre_completo")
        .eq("id", id_picker)
        .single();
    
    const nombrePicker = pickerData ? pickerData.nombre_completo : "Picker";

    // 2. Obtener datos para Snapshot (Llamada a Woo)
    const pedidosPromesas = ids_pedidos.map((id) => WooCommerce.get(`orders/${id}`));
    const responses = await Promise.all(pedidosPromesas);
    
    const snapshotPedidos = responses.map((r) => {
      const o = r.data;
      return {
        id: o.id,
        status: o.status,
        date_created: o.date_created,
        total: o.total,
        billing: o.billing,
        customer_note: o.customer_note,
        line_items: o.line_items.map(item => ({
          ...item,
          is_removed: false // Bandera para soft-delete
        }))
      };
    });

    // 3. Insertar Sesión
    const { data: session, error: sessError } = await supabase
      .from("wc_picking_sessions")
      .insert([{
          id_picker, ids_pedidos, estado: "en_proceso",
          fecha_inicio: new Date().toISOString(),
          snapshot_pedidos: snapshotPedidos
      }]).select().single();

    if (sessError) throw sessError;

    // 4. Actualizar estado del Picker
    await supabase.from("wc_pickers").update({ estado_picker: "picking", id_sesion_actual: session.id }).eq("id", id_picker);

    // 5. Crear Asignaciones (CON NOMBRE Y SNAPSHOT INDIVIDUAL)
    const asignaciones = ids_pedidos.map((idPedido) => {
        // Encontrar el snapshot correspondiente a este pedido específico
        const snapshot = snapshotPedidos.find(s => s.id === idPedido);
        
        return {
          id_pedido: idPedido, 
          id_picker: id_picker, 
          id_sesion: session.id,
          nombre_picker: nombrePicker, // Guardamos el nombre aquí
          reporte_snapshot: snapshot,  // Guardamos el snapshot individual
          estado_asignacion: "en_proceso", 
          fecha_inicio: new Date().toISOString(),
        };
    });

    const { error: assignError } = await supabase.from("wc_asignaciones_pedidos").insert(asignaciones);
    if (assignError) throw assignError;

    res.status(200).json({ message: "Sesión creada", session_id: session.id });
  } catch (error) {
    console.error("Error createSession:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getSessionActive = async (req, res) => {
  const { id_picker, include_removed } = req.query;

  try {
    const { data: picker } = await supabase.from("wc_pickers").select("id_sesion_actual").eq("id", id_picker).single();
    if (!picker || !picker.id_sesion_actual) return res.status(404).json({ message: "No tienes una sesión activa." });

    const sessionId = picker.id_sesion_actual;
    const { data: session } = await supabase.from("wc_picking_sessions").select("*").eq("id", sessionId).single();

    // Obtener órdenes (Snapshot o Woo en vivo si falla)
    let orders = session.snapshot_pedidos && session.snapshot_pedidos.length > 0 
        ? session.snapshot_pedidos 
        : (await Promise.all(session.ids_pedidos.map(id => WooCommerce.get(`orders/${id}`)))).map(r => r.data);

    const allItems = agruparItemsParaPicking(orders);
    
    let itemsAgrupados;
    if (include_removed === 'true') {
        itemsAgrupados = allItems.filter(item => item.quantity_total > 0 || item.is_removed); 
    } else {
        itemsAgrupados = allItems.filter(item => !item.is_removed && item.quantity_total > 0);
    }

    const { data: assignments } = await supabase.from('wc_asignaciones_pedidos').select('id').eq('id_sesion', sessionId);
    const assignIds = assignments.map(a => a.id);

    // Logs para determinar estado actual de cada producto
    const { data: logs } = await supabase
      .from("wc_log_picking")
      .select("id_producto, accion, es_sustituto, nombre_sustituto, precio_nuevo")
      .in("id_asignacion", assignIds)
      .in("id_producto", itemsAgrupados.map((i) => i.product_id));

    // Mapeo de Categorías Reales (para ordenar pasillos)
    const productIds = itemsAgrupados.map((i) => i.product_id);
    const mapaCategoriasReales = {};
    if (productIds.length > 0) {
        try {
            const { data: productsData } = await WooCommerce.get("products", { include: productIds.join(","), per_page: 100, _fields: "id,categories" });
            productsData.forEach((p) => { mapaCategoriasReales[p.id] = p.categories || []; });
        } catch (err) {}
    }

    const itemsConRuta = itemsAgrupados.map((item) => {
        const realCategories = mapaCategoriasReales[item.product_id] || item.categorias || [];
        const info = obtenerInfoPasillo(realCategories, item.name);
        const logItem = logs?.find((l) => l.id_producto === item.product_id && (l.accion === "recolectado" || l.accion === "sustituido"));

        return {
          ...item,
          pasillo: info.pasillo, prioridad: info.prioridad,
          categorias_reales: realCategories.map((c) => c.name).filter(n => n !== "Uncategorized"),
          status: logItem ? (logItem.es_sustituto ? "sustituido" : "recolectado") : "pendiente",
          sustituto: logItem && logItem.es_sustituto ? { name: logItem.nombre_sustituto, price: logItem.precio_nuevo } : null,
        };
    });

    itemsConRuta.sort((a, b) => a.prioridad - b.prioridad);

    res.status(200).json({
      session_id: session.id,
      fecha_inicio: session.fecha_inicio,
      orders_info: orders.map((o) => ({ id: o.id, customer: o.billing ? `${o.billing.first_name} ${o.billing.last_name}` : "Cliente", phone: o.billing?.phone, total: o.total })),
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
    // Marcamos como completado para que el Auditor lo vea, pero NO liberamos picker aún
    await supabase.from("wc_picking_sessions").update({ estado: "completado", fecha_fin: now }).eq("id", id_sesion);
    await supabase.from("wc_asignaciones_pedidos").update({ estado_asignacion: "completado", fecha_fin: now }).eq("id_sesion", id_sesion);
    
    // El picker queda "atrapado" en su frontend esperando la auditoría
    // NO actualizamos el estado_picker a 'disponible' aquí.
    
    res.status(200).json({ message: "Ruta finalizada. Esperando auditoría." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.cancelAssignment = async (req, res) => {
  const { id_picker } = req.body;
  try {
    const { data: pickerData } = await supabase.from("wc_pickers").select("id_sesion_actual").eq("id", id_picker).single();
    if (!pickerData || !pickerData.id_sesion_actual) {
      await supabase.from("wc_pickers").update({ estado_picker: "disponible", id_sesion_actual: null }).eq("id", id_picker);
      return res.status(200).json({ message: "Picker liberado." });
    }
    const idSesion = pickerData.id_sesion_actual;
    const now = new Date().toISOString();
    
    await supabase.from("wc_picking_sessions").update({ estado: "cancelado", fecha_fin: now }).eq("id", idSesion);
    await supabase.from("wc_asignaciones_pedidos").update({ estado_asignacion: "cancelado", fecha_fin: now }).eq("id_sesion", idSesion);
    await supabase.from("wc_pickers").update({ estado_picker: "disponible", id_sesion_actual: null }).eq("id", id_picker);
    
    res.status(200).json({ message: "Sesión cancelada." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};