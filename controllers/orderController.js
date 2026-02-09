const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");
const { obtenerInfoPasillo } = require("../tools/mapeadorPasillos");

// --- HELPER: Agrupar items (Batch Picking) ---
const agruparItemsParaPicking = (orders) => {
  const mapaProductos = {};

  orders.forEach((order) => {
    // Validación de seguridad por si order es null
    if (!order || !order.line_items) return;

    order.line_items.forEach((item) => {
      const key = item.product_id;

      if (!mapaProductos[key]) {
        mapaProductos[key] = {
          id: item.id,
          product_id: item.product_id,
          name: item.name,
          sku: item.sku,
          image_src: item.image?.src || "",
          price: parseFloat(item.price || 0),
          quantity_total: 0,
          pedidos_involucrados: [],
          categorias: item.parent_name ? [{ name: item.parent_name }] : [],
          // Intentamos recuperar barcode de meta_data si existe
          barcode: item.meta_data?.find((m) =>
              ["ean", "barcode", "_ean", "_barcode"].includes(m.key.toLowerCase())
            )?.value || "",
        };
      }

      mapaProductos[key].quantity_total += item.quantity;

      mapaProductos[key].pedidos_involucrados.push({
        id_pedido: order.id,
        nombre_cliente: order.billing ? `${order.billing.first_name} ${order.billing.last_name}` : "Cliente",
        cantidad: item.quantity,
      });
    });
  });

  return Object.values(mapaProductos);
};

// ==========================================
// 1. GESTIÓN DE SESIONES (CON SNAPSHOT)
// ==========================================

exports.createPickingSession = async (req, res) => {
  const { id_picker, ids_pedidos } = req.body;

  try {
    // 1. OBTENER DATOS DE WOOCOMMERCE (Una sola vez)
    // Esto evita saturar la API en el futuro.
    const pedidosPromesas = ids_pedidos.map((id) =>
      WooCommerce.get(`orders/${id}`)
    );
    const responses = await Promise.all(pedidosPromesas);
    
    // 2. CREAR SNAPSHOT LIMPIO
    // Guardamos una copia estática del pedido en nuestra BD
    const snapshotPedidos = responses.map((r) => {
      const o = r.data;
      return {
        id: o.id,
        status: o.status,
        date_created: o.date_created,
        total: o.total,
        billing: {
          first_name: o.billing.first_name,
          last_name: o.billing.last_name,
          phone: o.billing.phone,
          address_1: o.billing.address_1,
          city: o.billing.city
        },
        customer_note: o.customer_note,
        line_items: o.line_items.map(item => ({
          id: item.id,
          name: item.name,
          product_id: item.product_id,
          quantity: item.quantity,
          sku: item.sku,
          price: item.price,
          total: item.total,
          image: item.image,
          meta_data: item.meta_data,
          parent_name: item.parent_name // Importante para el mapeador
        }))
      };
    });

    // 3. INSERTAR SESIÓN CON SNAPSHOT
    const { data: session, error: sessError } = await supabase
      .from("wc_picking_sessions")
      .insert([
        {
          id_picker,
          ids_pedidos,
          estado: "en_proceso",
          fecha_inicio: new Date().toISOString(),
          snapshot_pedidos: snapshotPedidos // <--- AQUÍ ESTÁ LA OPTIMIZACIÓN
        },
      ])
      .select()
      .single();

    if (sessError) throw sessError;

    // 4. ACTUALIZAR PICKER
    await supabase
      .from("wc_pickers")
      .update({ estado_picker: "picking", id_sesion_actual: session.id })
      .eq("id", id_picker);

    // 5. REGISTRAR ASIGNACIONES
    const asignaciones = ids_pedidos.map((idPedido) => ({
      id_pedido: idPedido,
      id_picker: id_picker,
      id_sesion: session.id,
      estado_asignacion: "en_proceso",
      fecha_inicio: new Date().toISOString(),
    }));

    const { error: assignError } = await supabase
      .from("wc_asignaciones_pedidos")
      .insert(asignaciones);

    if (assignError) throw assignError;

    res.status(200).json({ message: "Sesión creada exitosamente", session_id: session.id });
  } catch (error) {
    console.error("Error creando sesión:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getSessionActive = async (req, res) => {
  const { id_picker } = req.query;

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

    // --- LÓGICA HÍBRIDA (OPTIMIZACIÓN) ---
    // Si existe snapshot, úsalo. Si no (sesiones viejas), llama a Woo.
    let orders = [];
    if (session.snapshot_pedidos && session.snapshot_pedidos.length > 0) {
        orders = session.snapshot_pedidos;
    } else {
        const pedidosPromesas = session.ids_pedidos.map((id) => WooCommerce.get(`orders/${id}`));
        const responses = await Promise.all(pedidosPromesas);
        orders = responses.map((r) => r.data);
    }

    const itemsAgrupados = agruparItemsParaPicking(orders);

    // --- FIX: Categorías ---
    // Intentamos usar las del snapshot si existen, sino buscamos en Woo
    // Nota: El snapshot guarda 'parent_name' que el mapeador usa como fallback
    const productIds = itemsAgrupados.map((i) => i.product_id);
    const mapaCategoriasReales = {};

    // Solo consultamos a Woo si realmente nos faltan datos críticos de categoría
    // Para optimizar, podríamos asumir que el nombre es suficiente, pero mantenemos esto por precisión
    if (productIds.length > 0) {
      try {
        // OPTIMIZACIÓN: Solo traemos campos necesarios
        const { data: productsData } = await WooCommerce.get("products", {
          include: productIds.join(","),
          per_page: 100,
          _fields: "id,categories" // Solo pedimos ID y categorías
        });
        productsData.forEach((p) => {
          mapaCategoriasReales[p.id] = p.categories || [];
        });
      } catch (err) {
        console.error("Warning: No se pudieron cargar categorías extra de Woo.");
      }
    }

    const { data: logs } = await supabase
      .from("wc_log_picking")
      .select("id_producto, accion, es_sustituto, nombre_sustituto, precio_nuevo")
      .in("id_producto", itemsAgrupados.map((i) => i.product_id));

    const itemsConRuta = itemsAgrupados.map((item) => {
        const realCategories = mapaCategoriasReales[item.product_id] || item.categorias || [];
        const info = obtenerInfoPasillo(realCategories, item.name);
        
        const logItem = logs?.find(
          (l) => l.id_producto === item.product_id && 
          (l.accion === "recolectado" || l.accion === "sustituido")
        );

        return {
          ...item,
          pasillo: info.pasillo,
          prioridad: info.prioridad,
          categorias_reales: realCategories.map((c) => c.name),
          status: logItem
            ? logItem.es_sustituto ? "sustituido" : "recolectado"
            : "pendiente",
          sustituto: logItem && logItem.es_sustituto
              ? { name: logItem.nombre_sustituto, price: logItem.precio_nuevo }
              : null,
        };
    });

    itemsConRuta.sort((a, b) => a.prioridad - b.prioridad);

    res.status(200).json({
      session_id: session.id,
      fecha_inicio: session.fecha_inicio,
      orders_info: orders.map((o) => ({
        id: o.id,
        customer: o.billing ? `${o.billing.first_name} ${o.billing.last_name}` : "Cliente",
        phone: o.billing?.phone,
        total: o.total,
      })),
      items: itemsConRuta,
    });
  } catch (error) {
    console.error("Error obteniendo sesión:", error);
    res.status(500).json({ error: "Error al cargar la sesión" });
  }
};

// ==========================================
// 2. ACCIONES DEL PICKER (LOGGING)
// ==========================================

exports.registerAction = async (req, res) => {
  const {
    id_sesion, id_producto_original, nombre_producto_original,
    accion, peso_real, datos_sustituto,
  } = req.body;

  try {
    const now = new Date();

    // Lógica RESET: Borrar log si el usuario se equivocó
    if (accion === "reset") {
      const { data: assigns } = await supabase
        .from("wc_asignaciones_pedidos")
        .select("id")
        .eq("id_sesion", id_sesion);

      if (assigns && assigns.length > 0) {
        const assignIds = assigns.map((a) => a.id);
        await supabase
          .from("wc_log_picking")
          .delete()
          .in("id_asignacion", assignIds)
          .eq("id_producto", id_producto_original);
      }
      return res.status(200).json({ status: "ok", message: "Reset OK" });
    }

    // Obtener IDs de referencia
    const { data: anyAssign } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, id_pedido")
      .eq("id_sesion", id_sesion)
      .limit(1)
      .maybeSingle();

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
      if (datos_sustituto) {
        logEntry.id_producto_final = datos_sustituto.id;
        logEntry.nombre_sustituto = datos_sustituto.name;
        logEntry.precio_nuevo = datos_sustituto.price;
      }
    } else {
        logEntry.es_sustituto = false;
    }

    const { error } = await supabase.from("wc_log_picking").insert([logEntry]);
    if (error) throw error;

    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("Error acción:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==========================================
// 3. BÚSQUEDA INTELIGENTE (SMART SEARCH)
// ==========================================

exports.searchProduct = async (req, res) => {
  const { query, original_id } = req.query;

  try {
    let products = [];

    // CASO A: Recomendación para Sustitución
    if (original_id && !query) {
      // 1. Datos originales
      const { data: original } = await WooCommerce.get(`products/${original_id}`);
      const originalPrice = parseFloat(original.price || 0);

      // 2. Filtro Categoría
      const validCategories = (original.categories || []).filter(
        (c) => c.name !== "Uncategorized" && c.slug !== "sin-categoria"
      );
      const categoryIds = validCategories.map(c => c.id).join(",");

      // 3. Keyword Maestra
      const cleanName = original.name.trim();
      let masterKeyword = cleanName.split(" ")[0];
      if (masterKeyword.length <= 3 && cleanName.split(" ").length > 1) {
        masterKeyword += " " + cleanName.split(" ")[1];
      }
      masterKeyword = masterKeyword.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s]/g, "");

      // 4. Consulta a Woo
      const searchParams = {
        search: masterKeyword,
        per_page: 50,
        status: "publish",
        stock_status: "instock",
      };
      if (categoryIds) searchParams.category = categoryIds;

      const { data: searchResults } = await WooCommerce.get("products", searchParams);

      // 5. Filtro Precio (40% tolerancia)
      const minPrice = originalPrice * 0.6;
      const maxPrice = originalPrice * 1.4;

      products = searchResults.filter((p) => {
        if (p.id === parseInt(original_id)) return false;
        const pPrice = parseFloat(p.price || 0);
        if (originalPrice > 0 && pPrice > 0) {
          if (pPrice < minPrice || pPrice > maxPrice) return false;
        }
        return true;
      });

      // 6. Ordenar por cercanía de precio
      products.sort((a, b) => {
        const diffA = Math.abs(parseFloat(a.price || 0) - originalPrice);
        const diffB = Math.abs(parseFloat(b.price || 0) - originalPrice);
        return diffA - diffB;
      });

    } 
    // CASO B: Búsqueda Manual
    else if (query) {
      const { data: searchResults } = await WooCommerce.get("products", {
        search: query,
        per_page: 20,
        status: "publish",
        stock_status: "instock"
      });
      products = searchResults;
    }

    const results = products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        image: p.images[0]?.src || null,
        stock: p.stock_quantity,
        sku: p.sku
    })).slice(0, 10);

    res.status(200).json(results);
  } catch (error) {
    console.error("Error searchProduct:", error);
    res.status(500).json({ error: "Error búsqueda" });
  }
};

// ==========================================
// 4. OTROS MÉTODOS
// ==========================================

exports.validateManualCode = async (req, res) => {
  const { input_code, expected_sku } = req.body;
  if (!input_code || !expected_sku) return res.status(400).json({ valid: false });
  
  const cleanInput = input_code.toString().trim();
  const cleanSku = expected_sku.toString().trim();

  try {
    if (cleanInput === cleanSku) return res.status(200).json({ valid: true, type: "id_directo" });
    
    const { data: barcodeMatch } = await supabase
      .from("siesa_codigos_barras")
      .select("id")
      .eq("codigo_barras", cleanInput)
      .eq("f120_id", cleanSku)
      .maybeSingle();
      
    if (barcodeMatch) return res.status(200).json({ valid: true, type: "codigo_barras" });
    return res.status(200).json({ valid: false });
  } catch (error) {
    res.status(500).json({ valid: false });
  }
};

exports.completeSession = async (req, res) => {
  const { id_sesion, id_picker } = req.body;
  try {
    const now = new Date();
    await supabase.from("wc_picking_sessions").update({ estado: "completado", fecha_fin: now }).eq("id", id_sesion);
    await supabase.from("wc_pickers").update({ estado_picker: "disponible", id_sesion_actual: null }).eq("id", id_picker);
    await supabase.from("wc_asignaciones_pedidos").update({ estado_asignacion: "completado", fecha_fin: now }).eq("id_sesion", id_sesion);
    res.status(200).json({ message: "Sesión finalizada." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPendingOrders = async (req, res) => {
  try {
    const { data: wcOrders } = await WooCommerce.get("orders", { status: "processing", per_page: 50 });
    const { data: activeAssignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id_pedido")
      .eq("estado_asignacion", "en_proceso");
      
    const assignedIds = new Set(activeAssignments.map((a) => a.id_pedido));
    const cleanOrders = wcOrders.map((order) => ({ ...order, is_assigned: assignedIds.has(order.id) }));
    
    res.status(200).json(cleanOrders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.getPickers = async (req, res) => {
  const { email } = req.query;
  let query = supabase.from("wc_pickers").select("*").order("nombre_completo", { ascending: true });
  if (email) query = query.eq("email", email);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json(data);
};

// ==========================================
// 6. DASHBOARD ANALÍTICO (OPTIMIZADO CON SNAPSHOT)
// ==========================================

exports.getActiveSessionsDashboard = async (req, res) => {
  try {
    const { data: sessions, error } = await supabase
      .from("wc_picking_sessions")
      .select(`
          id, fecha_inicio, id_picker, ids_pedidos, snapshot_pedidos,
          wc_pickers!wc_picking_sessions_picker_fkey ( nombre_completo, email )
      `)
      .eq("estado", "en_proceso");

    if (error) throw error;

    // Aquí ya NO llamamos a WooCommerce. Procesamos localmente.
    const dashboardData = await Promise.all(
      sessions.map(async (sess) => {
        
        // 1. Obtener ordenes (Del snapshot o fallback a Woo si es muy viejo)
        let orders = [];
        if (sess.snapshot_pedidos && sess.snapshot_pedidos.length > 0) {
            orders = sess.snapshot_pedidos;
        } else {
            // Fallback de compatibilidad
            const promesas = sess.ids_pedidos.map(id => WooCommerce.get(`orders/${id}`));
            const resps = await Promise.all(promesas);
            orders = resps.map(r => r.data);
        }

        const itemsUnificados = agruparItemsParaPicking(orders);
        const totalItems = itemsUnificados.length;

        // 2. Logs de progreso (Supabase)
        const { data: logs } = await supabase
          .from("wc_log_picking")
          .select("id_producto, accion, es_sustituto, fecha_registro, nombre_producto")
          .in("id_producto", itemsUnificados.map((i) => i.product_id));

        const recolectados = logs.filter(l => l.accion === "recolectado" && !l.es_sustituto).length;
        const sustituidos = logs.filter(l => l.es_sustituto).length;
        const completados = recolectados + sustituidos;
        const percentage = totalItems > 0 ? Math.round((completados / totalItems) * 100) : 0;

        // 3. Ubicación
        let currentLocation = "Inicio";
        if (logs.length > 0) {
          const lastLog = logs.sort((a, b) => new Date(b.fecha_registro) - new Date(a.fecha_registro))[0];
          const infoPasillo = obtenerInfoPasillo([], lastLog.nombre_producto);
          currentLocation = infoPasillo.pasillo !== "Otros" ? `Pasillo ${infoPasillo.pasillo}` : "General";
        }

        return {
          session_id: sess.id,
          picker_id: sess.id_picker,
          picker_name: sess.wc_pickers?.nombre_completo || "Desconocido",
          start_time: sess.fecha_inicio,
          total_items: totalItems,
          completed_items: completados,
          substituted_items: sustituidos,
          progress: percentage,
          current_location: currentLocation,
          orders_count: sess.ids_pedidos.length,
          order_ids: sess.ids_pedidos,
        };
      })
    );

    res.status(200).json(dashboardData);
  } catch (error) {
    console.error("Error dashboard:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==========================================
// 7. HISTORIAL Y AUDITORÍA
// ==========================================

exports.getHistorySessions = async (req, res) => {
  try {
    const { data: sessions, error } = await supabase
      .from("wc_picking_sessions")
      .select(`
          id, fecha_inicio, fecha_fin, estado, ids_pedidos,
          wc_pickers!wc_picking_sessions_picker_fkey ( nombre_completo, email )
      `)
      .eq("estado", "completado")
      .order("fecha_fin", { ascending: false })
      .limit(50);

    if (error) throw error;

    const historyData = sessions.map((sess) => {
      const start = new Date(sess.fecha_inicio);
      const end = new Date(sess.fecha_fin);
      const durationMin = Math.round((end - start) / 60000);

      return {
        id: sess.id,
        picker: sess.wc_pickers?.nombre_completo || "Desconocido",
        pedidos: sess.ids_pedidos,
        fecha: end.toLocaleDateString("es-CO"),
        hora_fin: end.toLocaleTimeString("es-CO"),
        duracion: `${durationMin} min`,
      };
    });

    res.status(200).json(historyData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSessionLogsDetail = async (req, res) => {
  const { session_id } = req.query;
  try {
    const { data: assignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id")
      .eq("id_sesion", session_id);

    const assignIds = assignments.map((a) => a.id);

    const { data: logs, error } = await supabase
      .from("wc_log_picking")
      .select("*")
      .in("id_asignacion", assignIds)
      .order("fecha_registro", { ascending: true });

    if (error) throw error;
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==========================================
// 8. CANCELACIÓN ROBUSTA (BATCH AWARE)
// ==========================================

exports.cancelAssignment = async (req, res) => {
  const { id_picker } = req.body;

  try {
    const { data: pickerData } = await supabase
      .from("wc_pickers")
      .select("id_sesion_actual")
      .eq("id", id_picker)
      .single();

    if (!pickerData || !pickerData.id_sesion_actual) {
      await supabase.from("wc_pickers").update({ estado_picker: "disponible", id_sesion_actual: null }).eq("id", id_picker);
      return res.status(200).json({ message: "Picker liberado." });
    }

    const idSesion = pickerData.id_sesion_actual;
    const now = new Date().toISOString();

    // 1. Cancelar sesión
    await supabase.from("wc_picking_sessions").update({ estado: "cancelado", fecha_fin: now }).eq("id", idSesion);
    
    // 2. Cancelar TODOS los pedidos asociados a esa sesión
    await supabase.from("wc_asignaciones_pedidos").update({ estado_asignacion: "cancelado", fecha_fin: now }).eq("id_sesion", idSesion);
    
    // 3. Liberar picker
    await supabase.from("wc_pickers").update({ estado_picker: "disponible", id_sesion_actual: null }).eq("id", id_picker);

    res.status(200).json({ message: "Sesión y pedidos cancelados." });
  } catch (error) {
    console.error("Error cancel:", error);
    res.status(500).json({ error: error.message });
  }
};