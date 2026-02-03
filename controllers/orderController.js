const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");
const { obtenerInfoPasillo } = require("../tools/mapeadorPasillos");

// --- HELPER: Agrupar items de múltiples pedidos (Batch Picking) ---
// Convierte N pedidos en una lista unificada de productos para el picker
const agruparItemsParaPicking = (orders) => {
  const mapaProductos = {};

  orders.forEach((order) => {
    order.line_items.forEach((item) => {
      // Usamos el ID del producto como clave única
      const key = item.product_id;

      if (!mapaProductos[key]) {
        mapaProductos[key] = {
          id: item.id, // ID de referencia (usamos uno cualquiera)
          product_id: item.product_id,
          name: item.name,
          sku: item.sku, // Importante: Suele ser el f120_id para validación SIESA
          image_src: item.image?.src || "", 
          quantity_total: 0,
          pedidos_involucrados: [],
          // Ajuste para el mapeador de pasillos:
          categorias: item.parent_name ? [{name: item.parent_name}] : [],
          // Intentamos extraer EAN de metadatos si existe
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

// Crear una Sesión de Picking (Unir varios pedidos para un picker)
exports.createPickingSession = async (req, res) => {
  const { id_picker, ids_pedidos } = req.body; 

  try {
    // A. Crear la sesión en BD
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

    // B. Actualizar al Picker (decirle que está ocupado en esta sesión)
    await supabase
      .from("wc_pickers")
      .update({ estado_picker: "picking", id_sesion_actual: session.id })
      .eq("id", id_picker);

    // C. Crear asignaciones individuales (para historial detallado)
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

// Obtener Datos de la Sesión Activa (La "Super Lista" para el App)
exports.getSessionActive = async (req, res) => {
  const { id_picker } = req.query;

  try {
    // A. Buscar si el picker tiene sesión activa
    const { data: picker } = await supabase
      .from("wc_pickers")
      .select("id_sesion_actual")
      .eq("id", id_picker)
      .single();

    if (!picker || !picker.id_sesion_actual) {
      return res.status(404).json({ message: "No tienes una sesión activa." });
    }

    const sessionId = picker.id_sesion_actual;

    // B. Obtener detalles de la sesión
    const { data: session } = await supabase
      .from("wc_picking_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    // C. Traer los pedidos de WooCommerce en tiempo real
    const pedidosPromesas = session.ids_pedidos.map(id => WooCommerce.get(`orders/${id}`));
    const responses = await Promise.all(pedidosPromesas);
    const orders = responses.map(r => r.data);

    // D. Agrupar items (Batch Picking)
    const itemsAgrupados = agruparItemsParaPicking(orders);

    // E. Consultar logs para ver qué ya se recogió
    // Usamos el id_producto original para verificar
    const { data: logs } = await supabase
         .from("wc_log_picking")
         .select("id_producto, accion, es_sustituto")
         .in("id_producto", itemsAgrupados.map(i => i.product_id));

    // F. Enriquecer items con ruta y estado
    const itemsConRuta = await Promise.all(itemsAgrupados.map(async (item) => {
      // Algoritmo de pasillos
      const info = obtenerInfoPasillo(item.categorias || [], item.name);
      
      // Verificar estado (Si existe un log 'recolectado' para este producto en la sesión actual)
      // Nota: Aquí se asume que los logs recuperados pertenecen a la sesión actual por contexto de tiempo o IDs
      const logItem = logs?.find(l => l.id_producto === item.product_id && l.accion === 'recolectado');
      
      return {
        ...item,
        pasillo: info.pasillo,
        prioridad: info.prioridad,
        status: logItem ? (logItem.es_sustituto ? 'sustituido' : 'recolectado') : 'pendiente'
      };
    }));

    // Ordenar por ruta óptima (Serpiente)
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
// 2. ACCIONES DEL PICKER (CORE)
// ==========================================

// Registrar Acción: Recolectar Normal, Pesar o Sustituir
exports.registerAction = async (req, res) => {
  const { 
    id_sesion, 
    id_producto_original, 
    nombre_producto_original, 
    accion, // 'recolectado' | 'sustituido'
    peso_real, // Opcional (si es pesable)
    datos_sustituto // Objeto opcional: { id, name, price }
  } = req.body;

  try {
    const now = new Date();
    
    // Necesitamos vincular el log a una asignación para mantener integridad referencial
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
         id_pedido: idPedidoRef, // Referencial
         id_producto: id_producto_original,
         fecha_registro: now,
         peso_real: peso_real || null,
    };

    if (accion === 'recolectado') {
      // --- CASO 1: RECOLECCIÓN NORMAL ---
      logEntry.nombre_producto = nombre_producto_original;
      logEntry.accion = 'recolectado';
      logEntry.es_sustituto = false;
      
    } else if (accion === 'sustituido') {
      // --- CASO 2: SUSTITUCIÓN ---
      logEntry.nombre_producto = nombre_producto_original; // Lo que pidieron
      logEntry.accion = 'recolectado'; // Marcamos como hecho
      logEntry.es_sustituto = true;
      logEntry.motivo = 'Sustitución por falta de stock';
      
      if (datos_sustituto) {
          logEntry.id_producto_final = datos_sustituto.id;
          logEntry.nombre_sustituto = datos_sustituto.name;
          logEntry.precio_nuevo = datos_sustituto.price;
      }
    }

    // Insertar Log
    const { error } = await supabase.from("wc_log_picking").insert([logEntry]);
    if (error) throw error;

    res.status(200).json({ status: "ok", message: "Acción registrada" });

  } catch (error) {
    console.error("Error registrando acción:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==========================================
// 3. BÚSQUEDA INTELIGENTE DE PRODUCTOS (Backend)
// ==========================================

exports.searchProduct = async (req, res) => {
    const { query, original_id } = req.query; 

    try {
        let products = [];

        // --- CASO A: SUGERENCIA AUTOMÁTICA (Si hay ID original y NO hay texto) ---
        if (original_id && !query) {
            // 1. Obtener datos del producto original para saber su categoría y precio
            const { data: original } = await WooCommerce.get(`products/${original_id}`);
            const price = parseFloat(original.price || 0);
            
            console.log(`[SUGERENCIA] Buscando para: ${original.name} ($${price})`);

            // 2. Filtro Inteligente de Categorías
            // Ignoramos categorías genéricas que ensucian la búsqueda (ej: "Despensa", "Sin categorizar")
            const categoriasEspecificas = original.categories.filter(c => {
                const name = c.name.toLowerCase();
                return !name.includes("despensa") && !name.includes("mercado") && !name.includes("sin categorizar");
            });

            // Si solo tiene genéricas, usamos esas. Si tiene específicas, usamos las específicas.
            const categoriasAUsar = categoriasEspecificas.length > 0 ? categoriasEspecificas : original.categories;
            const catIds = categoriasAUsar.map(c => c.id).join(',');
            
            // Guardamos IDs para verificación estricta posterior
            const originalCatIdsSet = new Set(original.categories.map(c => c.id));

            if (catIds) {
                // 3. Buscar en WooCommerce productos de esas categorías
                const { data: catProducts } = await WooCommerce.get("products", {
                    category: catIds,
                    per_page: 30, // Traemos varios para filtrar
                    status: 'publish',
                    stock_status: 'instock' // Solo sugerir lo que hay
                });

                // 4. Filtrado Estricto (Precio y Categoría exacta)
                const minPrice = price * 0.6; // 40% más barato máximo
                const maxPrice = price * 1.4; // 40% más caro máximo

                products = catProducts.filter(p => {
                    const pPrice = parseFloat(p.price || 0);
                    
                    // Excluir el mismo producto
                    if (p.id === parseInt(original_id)) return false;

                    // Validación Estricta: Debe compartir al menos una categoría ID exacta con el original
                    const comparteCategoria = p.categories.some(c => originalCatIdsSet.has(c.id));
                    if (!comparteCategoria) return false;

                    // Validación de Precio (Opcional, pero recomendada)
                    if (pPrice > 0 && (pPrice < minPrice || pPrice > maxPrice)) return false;

                    return true;
                });
            }
        } 
        // --- CASO B: BÚSQUEDA MANUAL (Picker escribió algo) ---
        else if (query) {
            const { data: searchResults } = await WooCommerce.get("products", {
                search: query,
                per_page: 20,
                status: 'publish'
            });
            products = searchResults;
        }

        // Mapeo limpio para el frontend
        const results = products.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            image: p.images[0]?.src || null,
            stock: p.stock_quantity,
            sku: p.sku
        })).slice(0, 10); // Máximo 10 resultados

        res.status(200).json(results);

    } catch (error) {
        console.error("Error en searchProduct:", error);
        res.status(500).json({ error: "Error buscando productos en Woo" });
    }
};

// ==========================================
// 4. VALIDACIÓN MANUAL ROBUSTA (SIESA)
// ==========================================

exports.validateManualCode = async (req, res) => {
  const { input_code, expected_sku } = req.body; // expected_sku = f120_id (ID interno)

  if (!input_code || !expected_sku) {
    return res.status(400).json({ valid: false, message: "Datos incompletos" });
  }

  const cleanInput = input_code.toString().trim();
  const cleanSku = expected_sku.toString().trim();

  try {
    // CASO 1: Ingresó el ID interno directamente (f120_id)
    if (cleanInput === cleanSku) {
       return res.status(200).json({ valid: true, type: 'id_directo' });
    }

    // CASO 2: Ingresó un Código de Barras
    // Buscamos si existe ese código Y si pertenece al producto esperado
    const { data: barcodeMatch, error } = await supabase
      .from('siesa_codigos_barras')
      .select('id')
      .eq('codigo_barras', cleanInput)
      .eq('f120_id', cleanSku) // ¡Validación Cruzada!
      .maybeSingle();

    if (error) throw error;

    if (barcodeMatch) {
      return res.status(200).json({ valid: true, type: 'codigo_barras' });
    }

    // No coincidió
    return res.status(200).json({ valid: false });

  } catch (error) {
    console.error("Error validando código SIESA:", error);
    res.status(500).json({ valid: false, error: "Error de servidor" });
  }
};

// ==========================================
// 5. FINALIZACIÓN Y AUXILIARES
// ==========================================

exports.completeSession = async (req, res) => {
    const { id_sesion, id_picker } = req.body;
    
    try {
        const now = new Date();
        
        // Cerrar sesión
        await supabase
            .from("wc_picking_sessions")
            .update({ estado: 'completado', fecha_fin: now })
            .eq("id", id_sesion);

        // Liberar picker
        await supabase
            .from("wc_pickers")
            .update({ estado_picker: 'disponible', id_sesion_actual: null })
            .eq("id", id_picker);

        // Cerrar pedidos individuales
        await supabase
            .from("wc_asignaciones_pedidos")
            .update({ estado_asignacion: 'completado', fecha_fin: now })
            .eq("id_sesion", id_sesion);

        res.status(200).json({ message: "Sesión finalizada." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Admin: Obtener pedidos pendientes (filtrando los ya asignados)
exports.getPendingOrders = async (req, res) => {
    try {
        const { data: wcOrders } = await WooCommerce.get("orders", { status: "processing", per_page: 50 });
        
        // Verificamos cuáles ya están en una sesión activa
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

// Admin: Obtener lista de pickers
exports.getPickers = async (req, res) => {
    const { email } = req.query;
    let query = supabase.from("wc_pickers").select("*").order("nombre_completo", { ascending: true });
    
    if (email) query = query.eq("email", email);
    
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    
    res.status(200).json(data);
};