const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");
const { obtenerInfoPasillo } = require("../tools/mapeadorPasillos");

// 1. Obtener pedidos pendientes (CRUZADO CON SUPABASE)
exports.getPendingOrders = async (req, res) => {
  try {
    // A. Traemos pedidos de WooCommerce (Procesando)
    const { data: wcOrders } = await WooCommerce.get("orders", {
      status: "processing", 
      per_page: 50,
      order: "asc",
    });

    // B. Traemos las asignaciones activas de Supabase
    const { data: activeAssignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id_pedido, nombre_recolectora, fecha_inicio")
      .eq("estado_asignacion", "en_proceso");

    // C. Mapa para búsqueda rápida
    const assignmentMap = {};
    activeAssignments.forEach((a) => {
      assignmentMap[a.id_pedido] = a;
    });

    // D. Cruzar datos: Inyectamos la info de asignación al pedido de WC
    const mergedOrders = wcOrders.map((order) => {
      const assignment = assignmentMap[order.id];
      return {
        ...order,
        // Flags personalizadas para el Frontend
        is_assigned: !!assignment, 
        assigned_to: assignment ? assignment.nombre_recolectora : null,
        started_at: assignment ? assignment.fecha_inicio : null,
      };
    });

    res.status(200).json(mergedOrders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener pedidos cruzados" });
  }
};

// 2. Obtener lista de recolectoras
exports.getRecolectoras = async (req, res) => {
  const { email } = req.query;
  try {
    let query = supabase
      .from("wc_recolectoras")
      .select("*")
      .order("nombre_completo", { ascending: true });

    if (email) query = query.eq("email", email);

    const { data, error } = await query;
    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 3. Asignar pedido
exports.assignOrder = async (req, res) => {
  const { id_pedido, id_recolectora, nombre_recolectora } = req.body;
  try {
    const { data, error } = await supabase
      .from("wc_asignaciones_pedidos")
      .insert([{ 
        id_pedido, 
        id_recolectora, 
        nombre_recolectora, 
        estado_asignacion: "en_proceso" 
      }])
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from("wc_recolectoras")
      .update({ estado_recolectora: "recolectando", id_pedido_actual: id_pedido })
      .eq("id", id_recolectora);

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 4. Detalle del pedido (Con lógica de Pasillos)
exports.getOrderById = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: order } = await WooCommerce.get(`orders/${id}`);
    
    // Enriquecer items con pasillos
    const items = await Promise.all(order.line_items.map(async (item) => {
      if (!item.product_id) return { ...item, pasillo: "N/A", priority: 99 };
      try {
        const { data: prod } = await WooCommerce.get(`products/${item.product_id}`);
        const info = obtenerInfoPasillo(prod.categories, prod.name); // Pasamos nombre también
        return { 
            ...item, 
            image_src: prod.images[0]?.src, 
            pasillo: info.pasillo, 
            prioridad: info.prioridad,
            categorias: prod.categories.map(c => c.name)
        };
      } catch (e) { return item; }
    }));

    order.line_items = items.sort((a, b) => a.prioridad - b.prioridad);
    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ error: "Error obteniendo detalle" });
  }
};

// 5. Finalizar Recolección (Actualiza Supabase y WooCommerce)
exports.completeCollection = async (req, res) => {
  const { id_pedido, id_recolectora } = req.body;
  try {
    const now = new Date();
    
    // A. Actualizar Supabase (Historial)
    const { data: asignacion } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("fecha_inicio")
      .eq("id_pedido", id_pedido)
      .eq("estado_asignacion", "en_proceso")
      .single();
      
    const duration = asignacion ? Math.floor((now - new Date(asignacion.fecha_inicio)) / 1000) : 0;

    await supabase
      .from("wc_asignaciones_pedidos")
      .update({ 
        estado_asignacion: "completado", 
        fecha_fin: now, 
        tiempo_total_segundos: duration 
      })
      .eq("id_pedido", id_pedido);

    // B. Liberar Recolectora
    await supabase
      .from("wc_recolectoras")
      .update({ estado_recolectora: "disponible", id_pedido_actual: null })
      .eq("id", id_recolectora);

    // C. OPCIONAL: Actualizar estado en WooCommerce a "Completed"
    // await WooCommerce.put(`orders/${id_pedido}`, { status: "completed" });

    res.status(200).json({ message: "Orden finalizada" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 6. Obtener Historial (MODIFICADO: Filtra por recolectora si se pide)
exports.getHistory = async (req, res) => {
  const { id_recolectora } = req.query; 

  try {
    let query = supabase
      .from("wc_asignaciones_pedidos")
      .select("*")
      .eq("estado_asignacion", "completado")
      .order("fecha_fin", { ascending: false });

    // Si nos envían un ID, filtramos solo por esa persona
    if (id_recolectora) {
      query = query.eq("id_recolectora", id_recolectora);
    } else {
      // Si es general, limitamos a 50
      query = query.limit(50);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};