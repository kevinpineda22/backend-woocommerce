const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");
// Importamos tu mapeador (el Juez para filtrar sugerencias incorrectas)
const { obtenerInfoPasillo } = require("../tools/mapeadorPasillos");

// --- HELPER: Agrupar items de múltiples pedidos (Batch Picking) ---
const agruparItemsParaPicking = (orders) => {
  const mapaProductos = {};

  orders.forEach((order) => {
    order.line_items.forEach((item) => {
      const key = item.product_id;

      if (!mapaProductos[key]) {
        mapaProductos[key] = {
          id: item.id, // ID referencia de línea
          product_id: item.product_id,
          name: item.name,
          sku: item.sku, // Importante para validación SIESA
          image_src: item.image?.src || "", 
          // PRECIO: Se captura para enviar al front
          price: parseFloat(item.price || 0),
          quantity_total: 0,
          pedidos_involucrados: [],
          categorias: item.parent_name ? [{name: item.parent_name}] : [],
          // Intentar extraer EAN
          barcode: item.meta_data?.find(m => 
            ['ean', 'barcode', '_ean', '_barcode'].includes(m.key.toLowerCase())
          )?.value || "",
        };
      }

      mapaProductos[key].quantity_total += item.quantity;
      
      mapaProductos[key].pedidos_involucrados.push({
        id_pedido: order.id,
        nombre_cliente: `${order.billing.first_name} ${order.billing.last_name}`,
        cantidad: item.quantity
      });
    });
  });

  return Object.values(mapaProductos);
};

// ==========================================
// 1. GESTIÓN DE SESIONES
// ==========================================

exports.createPickingSession = async (req, res) => {
  const { id_picker, ids_pedidos } = req.body; 

  try {
    const { data: session, error: sessError } = await supabase
      .from("wc_picking_sessions")
      .insert([{ 
        id_picker, 
        ids_pedidos, 
        estado: 'en_proceso',
        fecha_inicio: new Date().toISOString()
      }])
      .select()
      .single();

    if (sessError) throw sessError;

    await supabase
      .from("wc_pickers")
      .update({ estado_picker: "picking", id_sesion_actual: session.id })
      .eq("id", id_picker);

    const asignaciones = ids_pedidos.map(idPedido => ({
      id_pedido: idPedido,
      id_picker: id_picker,
      id_sesion: session.id,
      estado_asignacion: 'en_proceso',
      fecha_inicio: new Date().toISOString()
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
    const { data: picker } = await supabase.from("wc_pickers").select("id_sesion_actual").eq("id", id_picker).single();
    if (!picker || !picker.id_sesion_actual) return res.status(404).json({ message: "No tienes una sesión activa." });

    const sessionId = picker.id_sesion_actual;
    const { data: session } = await supabase.from("wc_picking_sessions").select("*").eq("id", sessionId).single();

    const pedidosPromesas = session.ids_pedidos.map(id => WooCommerce.get(`orders/${id}`));
    const responses = await Promise.all(pedidosPromesas);
    const orders = responses.map(r => r.data);

    const itemsAgrupados = agruparItemsParaPicking(orders);

    // Traemos datos extra del log (nombre y precio del sustituto)
    const { data: logs } = await supabase
         .from("wc_log_picking")
         .select("id_producto, accion, es_sustituto, nombre_sustituto, precio_nuevo")
         .in("id_producto", itemsAgrupados.map(i => i.product_id));

    const itemsConRuta = await Promise.all(itemsAgrupados.map(async (item) => {
      const info = obtenerInfoPasillo(item.categorias || [], item.name);
      // Buscamos logs recientes (recolectado o sustituido)
      const logItem = logs?.find(l => l.id_producto === item.product_id && (l.accion === 'recolectado' || l.accion === 'sustituido'));
      
      return {
        ...item,
        pasillo: info.pasillo,
        prioridad: info.prioridad,
        status: logItem ? (logItem.es_sustituto ? 'sustituido' : 'recolectado') : 'pendiente',
        // Adjuntamos info del sustituto para el frontend
        sustituto: logItem && logItem.es_sustituto ? {
            name: logItem.nombre_sustituto,
            price: logItem.precio_nuevo
        } : null
      };
    }));

    itemsConRuta.sort((a, b) => a.prioridad - b.prioridad);

    res.status(200).json({
      session_id: session.id,
      orders_info: orders.map(o => ({ id: o.id, customer: `${o.billing.first_name} ${o.billing.last_name}`, total: o.total })),
      items: itemsConRuta
    });

  } catch (error) {
    console.error("Error obteniendo sesión:", error);
    res.status(500).json({ error: "Error al cargar la sesión" });
  }
};

// ==========================================
// 2. ACCIONES DEL PICKER
// ==========================================

exports.registerAction = async (req, res) => {
  const { 
    id_sesion, id_producto_original, nombre_producto_original, 
    accion, peso_real, datos_sustituto 
  } = req.body;

  try {
    const now = new Date();
    
    // --- LÓGICA DE RESET / DESHACER ---
    if (accion === 'reset') {
        const { data: assigns } = await supabase
            .from('wc_asignaciones_pedidos')
            .select('id')
            .eq('id_sesion', id_sesion);
            
        if (assigns && assigns.length > 0) {
             const assignIds = assigns.map(a => a.id);
             await supabase.from("wc_log_picking")
                .delete()
                .in('id_asignacion', assignIds)
                .eq('id_producto', id_producto_original);
        }
        return res.status(200).json({ status: "ok", message: "Producto devuelto a pendientes" });
    }

    // --- LÓGICA NORMAL ---
    // Usamos maybeSingle() para evitar crash si no encuentra asignación
    const { data: anyAssign } = await supabase
        .from('wc_asignaciones_pedidos')
        .select('id, id_pedido')
        .eq('id_sesion', id_sesion)
        .limit(1)
        .maybeSingle(); 
        
    // Si es null, enviamos NULL a la BD, nunca 0.
    const idAsignacionRef = anyAssign ? anyAssign.id : null;
    const idPedidoRef = anyAssign ? anyAssign.id_pedido : null; 

    const logEntry = {
         id_asignacion: idAsignacionRef,
         id_pedido: idPedidoRef, 
         id_producto: id_producto_original,
         fecha_registro: now,
         peso_real: peso_real || null,
    };

    if (accion === 'recolectado') {
      logEntry.nombre_producto = nombre_producto_original;
      logEntry.accion = 'recolectado';
      logEntry.es_sustituto = false;
      
    } else if (accion === 'sustituido') {
      logEntry.nombre_producto = nombre_producto_original; 
      logEntry.accion = 'recolectado'; 
      logEntry.es_sustituto = true;
      logEntry.motivo = 'Sustitución por falta de stock';
      
      if (datos_sustituto) {
          logEntry.id_producto_final = datos_sustituto.id;
          logEntry.nombre_sustituto = datos_sustituto.name;
          logEntry.precio_nuevo = datos_sustituto.price;
      }
    }

    const { error } = await supabase.from("wc_log_picking").insert([logEntry]);
    
    if (error) {
        console.error("Error Supabase Insert:", error); 
        throw error;
    }

    res.status(200).json({ status: "ok", message: "Acción registrada" });

  } catch (error) {
    console.error("Error registrando acción:", error);
    res.status(500).json({ error: error.message });
  }
};

// =========================================================================
// 3. BÚSQUEDA INTELIGENTE
// =========================================================================

exports.searchProduct = async (req, res) => {
    const { query, original_id } = req.query; 

    try {
        let products = [];

        // --- MODO SUGERENCIA INTELIGENTE ---
        if (original_id && !query) {
            const { data: original } = await WooCommerce.get(`products/${original_id}`);
            const price = parseFloat(original.price || 0);
            
            // Detectar Pasillo Original
            const infoOriginal = obtenerInfoPasillo(original.categories, original.name);
            console.log(`\n🔍 [IA PASILLOS] Original: "${original.name}" -> Pasillo: ${infoOriginal.pasillo}`);

            // Extraer Palabra Clave
            const cleanName = original.name.trim();
            let masterKeyword = cleanName.split(' ')[0]; 
            if (masterKeyword.length <= 2 && cleanName.split(' ').length > 1) {
                masterKeyword = cleanName.split(' ')[1];
            }
            masterKeyword = masterKeyword.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, ""); 

            // Buscar en Woo
            const { data: searchResults } = await WooCommerce.get("products", {
                search: masterKeyword,
                per_page: 50,
                status: 'publish',
                stock_status: 'instock'
            });

            // Filtrado Estricto
            const minPrice = price * 0.5; 
            const maxPrice = price * 1.5; 

            products = searchResults.filter(p => {
                if (p.id === parseInt(original_id)) return false;

                const pPrice = parseFloat(p.price || 0);
                if (price > 0 && pPrice > 0) {
                    if (pPrice < minPrice || pPrice > maxPrice) return false;
                }

                if (!p.name.toLowerCase().includes(masterKeyword.toLowerCase())) return false;

                const infoCandidato = obtenerInfoPasillo(p.categories, p.name);
                
                // Filtro de Pasillo
                if (infoOriginal.pasillo !== "Otros" && infoOriginal.pasillo !== infoCandidato.pasillo) {
                    return false;
                }
                return true;
            });
        } 
        // --- MODO MANUAL ---
        else if (query) {
            const { data: searchResults } = await WooCommerce.get("products", {
                search: query,
                per_page: 20,
                status: 'publish'
            });
            products = searchResults;
        }

        const results = products.map(p => ({
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
        res.status(500).json({ error: "Error en búsqueda" });
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
    if (cleanInput === cleanSku) return res.status(200).json({ valid: true, type: 'id_directo' });

    const { data: barcodeMatch } = await supabase
      .from('siesa_codigos_barras')
      .select('id')
      .eq('codigo_barras', cleanInput)
      .eq('f120_id', cleanSku)
      .maybeSingle();

    if (barcodeMatch) return res.status(200).json({ valid: true, type: 'codigo_barras' });

    return res.status(200).json({ valid: false });

  } catch (error) {
    console.error("Error validando SIESA:", error);
    res.status(500).json({ valid: false, error: "Error de servidor" });
  }
};

exports.completeSession = async (req, res) => {
    const { id_sesion, id_picker } = req.body;
    try {
        const now = new Date();
        await supabase.from("wc_picking_sessions").update({ estado: 'completado', fecha_fin: now }).eq("id", id_sesion);
        await supabase.from("wc_pickers").update({ estado_picker: 'disponible', id_sesion_actual: null }).eq("id", id_picker);
        await supabase.from("wc_asignaciones_pedidos").update({ estado_asignacion: 'completado', fecha_fin: now }).eq("id_sesion", id_sesion);
        res.status(200).json({ message: "Sesión finalizada." });
    } catch (error) { res.status(500).json({ error: error.message }); }
};

exports.getPendingOrders = async (req, res) => {
    try {
        const { data: wcOrders } = await WooCommerce.get("orders", { status: "processing", per_page: 50 });
        const { data: activeAssignments } = await supabase.from("wc_asignaciones_pedidos").select("id_pedido").eq("estado_asignacion", "en_proceso");
        const assignedIds = new Set(activeAssignments.map(a => a.id_pedido));
        
        const cleanOrders = wcOrders.map(order => ({
            ...order,
            is_assigned: assignedIds.has(order.id)
        }));
        
        res.status(200).json(cleanOrders);
    } catch (e) { res.status(500).json({ error: e.message }); }
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
// 6. DASHBOARD ANALÍTICO (EN VIVO)
// ==========================================

exports.getActiveSessionsDashboard = async (req, res) => {
    try {
        // 1. Obtener Sesiones 'en_proceso'
        const { data: sessions, error } = await supabase
            .from("wc_picking_sessions")
            .select(`
                id,
                fecha_inicio,
                wc_pickers ( nombre_completo, email ),
                ids_pedidos
            `)
            .eq("estado", "en_proceso");

        if (error) throw error;

        // 2. Enriquecer cada sesión con cálculo de progreso
        const dashboardData = await Promise.all(sessions.map(async (sess) => {
            // A. Traer detalles de WooCommerce para saber el TOTAL de items
            const pedidosPromesas = sess.ids_pedidos.map(id => WooCommerce.get(`orders/${id}`));
            const responses = await Promise.all(pedidosPromesas);
            const orders = responses.map(r => r.data);
            
            // Usamos tu helper para unificar productos y saber cantidad total
            const itemsUnificados = agruparItemsParaPicking(orders);
            const totalItems = itemsUnificados.length; 

            // B. Traer logs de supabase para saber cuantos están listos
            const { data: logs } = await supabase
                .from("wc_log_picking")
                .select("id_producto, accion, es_sustituto, fecha_registro, nombre_producto")
                .in("id_producto", itemsUnificados.map(i => i.product_id));

            // C. Calcular métricas
            const recolectados = logs.filter(l => l.accion === 'recolectado' && !l.es_sustituto).length;
            const sustituidos = logs.filter(l => l.es_sustituto).length;
            const completados = recolectados + sustituidos;
            
            const percentage = totalItems > 0 ? Math.round((completados / totalItems) * 100) : 0;

            // D. Ubicación Actual (Último log)
            let currentLocation = "Inicio";
            if (logs.length > 0) {
                // Ordenar logs por fecha descendente
                const lastLog = logs.sort((a,b) => new Date(b.fecha_registro) - new Date(a.fecha_registro))[0];
                const infoPasillo = obtenerInfoPasillo([], lastLog.nombre_producto); 
                currentLocation = infoPasillo.pasillo !== "Otros" ? `Pasillo ${infoPasillo.pasillo}` : "General";
            }

            return {
                session_id: sess.id,
                picker_name: sess.wc_pickers?.nombre_completo || "Desconocido",
                start_time: sess.fecha_inicio,
                total_items: totalItems,
                completed_items: completados,
                substituted_items: sustituidos,
                progress: percentage,
                current_location: currentLocation,
                orders_count: sess.ids_pedidos.length,
                order_ids: sess.ids_pedidos
            };
        }));

        res.status(200).json(dashboardData);

    } catch (error) {
        console.error("Error dashboard:", error);
        res.status(500).json({ error: error.message });
    }
};

// ==========================================
// 7. HISTORIAL Y AUDITORÍA (NUEVO)
// ==========================================

// Obtener lista de sesiones terminadas
exports.getHistorySessions = async (req, res) => {
    try {
        const { data: sessions, error } = await supabase
            .from("wc_picking_sessions")
            .select(`
                id,
                fecha_inicio,
                fecha_fin,
                estado,
                ids_pedidos,
                wc_pickers ( nombre_completo, email )
            `)
            .eq("estado", "completado")
            .order("fecha_fin", { ascending: false })
            .limit(50); // Traemos las últimas 50 para no saturar

        if (error) throw error;

        const historyData = sessions.map(sess => {
            const start = new Date(sess.fecha_inicio);
            const end = new Date(sess.fecha_fin);
            const durationMin = Math.round((end - start) / 60000);

            return {
                id: sess.id,
                picker: sess.wc_pickers?.nombre_completo || "Desconocido",
                pedidos: sess.ids_pedidos,
                fecha: end.toLocaleDateString("es-CO"),
                hora_fin: end.toLocaleTimeString("es-CO"),
                duracion: `${durationMin} min`
            };
        });

        res.status(200).json(historyData);
    } catch (error) {
        console.error("Error history:", error);
        res.status(500).json({ error: error.message });
    }
};

// Obtener detalle forense de una sesión (Logs)
exports.getSessionLogsDetail = async (req, res) => {
    const { session_id } = req.query;
    try {
        // 1. Obtener los logs de esa sesión (Uniendo con asignaciones para llegar a la sesión)
        const { data: assignments } = await supabase
            .from("wc_asignaciones_pedidos")
            .select("id")
            .eq("id_sesion", session_id);
            
        const assignIds = assignments.map(a => a.id);

        const { data: logs, error } = await supabase
            .from("wc_log_picking")
            .select("*")
            .in("id_asignacion", assignIds)
            .order("fecha_registro", { ascending: true });

        if (error) throw error;

        res.status(200).json(logs);
    } catch (error) {
        console.error("Error logs detail:", error);
        res.status(500).json({ error: error.message });
    }
};