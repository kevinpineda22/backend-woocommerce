const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");
const { obtenerInfoPasillo } = require("../tools/mapeadorPasillos");

// --- HELPER: Agrupar items de múltiples pedidos (Batch Picking) ---
const agruparItemsParaPicking = (orders) => {
  const mapaProductos = {};

  orders.forEach((order) => {
    order.line_items.forEach((item) => {
      // Usamos el ID del producto como clave única
      const key = item.product_id;

      if (!mapaProductos[key]) {
        mapaProductos[key] = {
          id: item.id, // ID referencia
          product_id: item.product_id,
          name: item.name,
          sku: item.sku, // Este suele ser el f120_id en integraciones SIESA
          image_src: item.image?.src || "", 
          quantity_total: 0,
          pedidos_involucrados: [],
          categorias: item.parent_name ? [{name: item.parent_name}] : [],
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
// 1. GESTIÓN DE SESIONES (MULTI-ORDEN)
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
    const { data: picker } = await supabase
      .from("wc_pickers")
      .select("id_sesion_actual")
      .eq("id", id_picker)
      .single();

    if (!picker || !picker.id_sesion_actual) {
      return res.status(404).json({ message: "No tienes una sesión activa." });
    }

    const sessionId = picker.id_sesion_actual;

    const { data: session } = await supabase
      .from("wc_picking_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    const pedidosPromesas = session.ids_pedidos.map(id => WooCommerce.get(`orders/${id}`));
    const responses = await Promise.all(pedidosPromesas);
    const orders = responses.map(r => r.data);

    const itemsAgrupados = agruparItemsParaPicking(orders);

    const { data: logs } = await supabase
         .from("wc_log_picking")
         .select("id_producto, accion, es_sustituto")
         .in("id_producto", itemsAgrupados.map(i => i.product_id)); // Filtro básico

    const itemsConRuta = await Promise.all(itemsAgrupados.map(async (item) => {
      const info = obtenerInfoPasillo(item.categorias || [], item.name);
      
      // Verificamos si en esta sesión específica (aprox) ya se recolectó
      // Nota: Idealmente wc_log_picking debería tener id_sesion para ser exactos
      const logItem = logs?.find(l => l.id_producto === item.product_id && l.accion === 'recolectado');
      
      return {
        ...item,
        pasillo: info.pasillo,
        prioridad: info.prioridad,
        status: logItem ? (logItem.es_sustituto ? 'sustituido' : 'recolectado') : 'pendiente'
      };
    }));

    itemsConRuta.sort((a, b) => a.prioridad - b.prioridad);

    res.status(200).json({
      session_id: session.id,
      orders_info: orders.map(o => ({ 
          id: o.id, 
          customer: `${o.billing.first_name} ${o.billing.last_name}`,
          total: o.total
      })),
      items: itemsConRuta
    });

  } catch (error) {
    console.error("Error obteniendo sesión:", error);
    res.status(500).json({ error: "Error al cargar la sesión de picking" });
  }
};

// ==========================================
// 2. ACCIONES DEL PICKER
// ==========================================

exports.registerAction = async (req, res) => {
  const { 
    id_sesion, 
    id_producto_original, 
    nombre_producto_original, 
    accion, 
    peso_real, 
    datos_sustituto 
  } = req.body;

  try {
    const now = new Date();
    
    // Referencia auxiliar para mantener compatibilidad FK
    const { data: anyAssign } = await supabase
        .from('wc_asignaciones_pedidos')
        .select('id, id_pedido')
        .eq('id_sesion', id_sesion)
        .limit(1)
        .single();
        
    const idAsignacionRef = anyAssign ? anyAssign.id : null;
    const idPedidoRef = anyAssign ? anyAssign.id_pedido : 0; 

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
    if (error) throw error;

    res.status(200).json({ status: "ok", message: "Acción registrada" });

  } catch (error) {
    console.error("Error registrando acción:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.searchProduct = async (req, res) => {
    const { query } = req.query; 
    if (!query) return res.status(400).json({ error: "Query requerido" });

    try {
        const { data: products } = await WooCommerce.get("products", {
            search: query,
            per_page: 20
        });

        const results = products.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            image: p.images[0]?.src || null,
            stock: p.stock_quantity,
            sku: p.sku
        }));

        res.status(200).json(results);
    } catch (error) {
        res.status(500).json({ error: "Error conectando con WooCommerce" });
    }
};

exports.completeSession = async (req, res) => {
    const { id_sesion, id_picker } = req.body;
    
    try {
        const now = new Date();
        
        await supabase
            .from("wc_picking_sessions")
            .update({ estado: 'completado', fecha_fin: now })
            .eq("id", id_sesion);

        await supabase
            .from("wc_pickers")
            .update({ estado_picker: 'disponible', id_sesion_actual: null })
            .eq("id", id_picker);

        await supabase
            .from("wc_asignaciones_pedidos")
            .update({ estado_asignacion: 'completado', fecha_fin: now })
            .eq("id_sesion", id_sesion);

        res.status(200).json({ message: "Sesión finalizada." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ==========================================
// 3. VALIDACIÓN MANUAL ROBUSTA (SIESA)
// ==========================================

exports.validateManualCode = async (req, res) => {
  // expected_sku: Debe ser el f120_id que viene en el pedido
  const { input_code, expected_sku } = req.body; 

  if (!input_code || !expected_sku) {
    return res.status(400).json({ valid: false, message: "Datos incompletos" });
  }

  const cleanInput = input_code.toString().trim();
  const cleanSku = expected_sku.toString().trim();

  try {
    // CASO A: El picker ingresó directamente el ID del Item (f120_id)
    if (cleanInput === cleanSku) {
       return res.status(200).json({ valid: true, type: 'id_directo' });
    }

    // CASO B: El picker ingresó un Código de Barras
    // Buscamos en la tabla de barras si existe ese código Y si pertenece al item esperado
    const { data: barcodeMatch, error } = await supabase
      .from('siesa_codigos_barras')
      .select('id')
      .eq('codigo_barras', cleanInput)
      .eq('f120_id', cleanSku) // ¡Debe coincidir con el producto esperado!
      .maybeSingle();

    if (error) throw error;

    if (barcodeMatch) {
      return res.status(200).json({ valid: true, type: 'codigo_barras' });
    }

    // Si no coincidió con nada
    return res.status(200).json({ valid: false });

  } catch (error) {
    console.error("Error validando código SIESA:", error);
    // En caso de error técnico, mejor denegar por seguridad
    res.status(500).json({ valid: false, error: "Error de servidor" });
  }
};

// ==========================================
// 4. MÉTODOS DE APOYO (ADMIN)
// ==========================================

exports.getPendingOrders = async (req, res) => {
    try {
        const { data: wcOrders } = await WooCommerce.get("orders", { status: "processing", per_page: 50 });
        
        const { data: activeAssignments } = await supabase
            .from("wc_asignaciones_pedidos")
            .select("id_pedido")
            .eq("estado_asignacion", "en_proceso");
            
        const assignedIds = new Set(activeAssignments.map(a => a.id_pedido));
        
        const cleanOrders = wcOrders.map(order => ({
            ...order,
            is_assigned: assignedIds.has(order.id)
        }));
        
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