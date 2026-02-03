const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");
// Usamos el mapeador para ordenar la ruta del picker (Serpiente), aunque no para la búsqueda estricta.
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
          id: item.id, // ID de referencia
          product_id: item.product_id,
          name: item.name,
          sku: item.sku, // Importante para validación SIESA
          image_src: item.image?.src || "", 
          quantity_total: 0,
          pedidos_involucrados: [],
          categorias: item.parent_name ? [{name: item.parent_name}] : [],
          // Intentar extraer EAN de metadatos si existe
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

// Crear una Sesión de Picking
exports.createPickingSession = async (req, res) => {
  const { id_picker, ids_pedidos } = req.body; 

  try {
    // 1. Crear la sesión en BD
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

    // 2. Actualizar al Picker
    await supabase
      .from("wc_pickers")
      .update({ estado_picker: "picking", id_sesion_actual: session.id })
      .eq("id", id_picker);

    // 3. Crear asignaciones individuales
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

// Obtener Datos de la Sesión Activa
exports.getSessionActive = async (req, res) => {
  const { id_picker } = req.query;

  try {
    // 1. Buscar si el picker tiene sesión activa
    const { data: picker } = await supabase
      .from("wc_pickers")
      .select("id_sesion_actual")
      .eq("id", id_picker)
      .single();

    if (!picker || !picker.id_sesion_actual) {
      return res.status(404).json({ message: "No tienes una sesión activa." });
    }

    const sessionId = picker.id_sesion_actual;

    // 2. Obtener detalles de la sesión
    const { data: session } = await supabase
      .from("wc_picking_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    // 3. Traer los pedidos de WooCommerce
    const pedidosPromesas = session.ids_pedidos.map(id => WooCommerce.get(`orders/${id}`));
    const responses = await Promise.all(pedidosPromesas);
    const orders = responses.map(r => r.data);

    // 4. Agrupar items (Batch Picking)
    const itemsAgrupados = agruparItemsParaPicking(orders);

    // 5. Consultar logs para ver qué ya se recogió
    const { data: logs } = await supabase
         .from("wc_log_picking")
         .select("id_producto, accion, es_sustituto")
         .in("id_producto", itemsAgrupados.map(i => i.product_id));

    // 6. Enriquecer items con ruta y estado
    const itemsConRuta = await Promise.all(itemsAgrupados.map(async (item) => {
      // Usamos el mapeador para el orden lógico de pasillos
      const info = obtenerInfoPasillo(item.categorias || [], item.name);
      const logItem = logs?.find(l => l.id_producto === item.product_id && l.accion === 'recolectado');
      
      return {
        ...item,
        pasillo: info.pasillo,
        prioridad: info.prioridad,
        status: logItem ? (logItem.es_sustituto ? 'sustituido' : 'recolectado') : 'pendiente'
      };
    }));

    // 7. Ordenar por ruta óptima
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
    id_sesion, id_producto_original, nombre_producto_original, 
    accion, peso_real, datos_sustituto 
  } = req.body;

  try {
    const now = new Date();
    
    // Buscar asignación válida para referencia FK
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

// =========================================================================
// 3. BÚSQUEDA INTELIGENTE SEMÁNTICA (NOMBRE + PRECIO)
// =========================================================================

exports.searchProduct = async (req, res) => {
    const { query, original_id } = req.query; 

    try {
        let products = [];

        // --- MODO SUGERENCIA INTELIGENTE ---
        if (original_id && !query) {
            // 1. Obtener el producto original
            const { data: original } = await WooCommerce.get(`products/${original_id}`);
            const price = parseFloat(original.price || 0);
            
            // LOG DE DEPURACIÓN 1
            console.log(`\n🔍 [BUSQUEDA IA] Original: "${original.name}" | Precio: $${price}`);

            // 2. EXTRAER "PALABRA CLAVE MAESTRA" (La primera palabra del nombre)
            // Limpiamos espacios y quitamos marcas si están al inicio
            const cleanName = original.name.trim();
            let masterKeyword = cleanName.split(' ')[0]; // "Arroz" de "Arroz Diana"

            // Excepción: Si la primera palabra es muy corta (ej: "De", "El"), tomamos la segunda
            if (masterKeyword.length <= 2 && cleanName.split(' ').length > 1) {
                masterKeyword = cleanName.split(' ')[1];
            }

            // Normalizamos (quitamos símbolos raros)
            masterKeyword = masterKeyword.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, ""); 

            console.log(`   🔑 Palabra Clave Maestra detectada: "${masterKeyword}"`);

            // 3. BUSCAR EN WOOCOMMERCE POR NOMBRE
            // Ignoramos categorías porque suelen estar sucias en Woo. Confiamos en el nombre.
            const { data: searchResults } = await WooCommerce.get("products", {
                search: masterKeyword,
                per_page: 40, // Traemos bastantes para filtrar
                status: 'publish',
                stock_status: 'instock'
            });

            console.log(`   📦 Resultados brutos encontrados en Woo: ${searchResults.length}`);

            // 4. FILTRADO ESTRICTO EN MEMORIA
            const minPrice = price * 0.5; // Margen 50%
            const maxPrice = price * 1.5; 

            products = searchResults.filter(p => {
                const pPrice = parseFloat(p.price || 0);
                
                // A. No ser el mismo
                if (p.id === parseInt(original_id)) return false;

                // B. VALIDACIÓN DE NOMBRE (EL FILTRO ANTI-SUAVIZANTE)
                // El producto candidato DEBE contener la palabra clave en su nombre.
                // Ej: Si busco "Arroz", "Suavizante" no tiene "Arroz" en el nombre -> Eliminado.
                const candidateName = p.name.toLowerCase();
                const keywordLower = masterKeyword.toLowerCase();
                
                if (!candidateName.includes(keywordLower)) {
                    // console.log(`      ❌ Descartado por nombre: ${p.name}`);
                    return false;
                }

                // C. Validación de Precio (Evita sugerir Arroz Premium de 50k por uno de 2k)
                if (price > 0 && pPrice > 0) {
                    if (pPrice < minPrice || pPrice > maxPrice) {
                        // console.log(`      ❌ Descartado por precio: ${p.name} ($${pPrice})`);
                        return false;
                    }
                }

                // console.log(`      ✅ Candidato válido: ${p.name}`);
                return true;
            });

            console.log(`   ✨ Resultados finales filtrados: ${products.length}`);
        } 
        
        // --- MODO MANUAL (Picker escribe en la barra) ---
        else if (query) {
            console.log(`\n🔍 [BUSQUEDA MANUAL] Query: "${query}"`);
            const { data: searchResults } = await WooCommerce.get("products", {
                search: query,
                per_page: 20,
                status: 'publish'
            });
            products = searchResults;
        }

        // Mapeo Final Limpio para el Frontend
        const results = products.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            image: p.images[0]?.src || null,
            stock: p.stock_quantity,
            sku: p.sku
        })).slice(0, 10); // Top 10

        res.status(200).json(results);

    } catch (error) {
        console.error("Error searchProduct:", error);
        res.status(500).json({ error: "Error en búsqueda" });
    }
};

// ==========================================
// 4. VALIDACIÓN MANUAL SIESA
// ==========================================

exports.validateManualCode = async (req, res) => {
  const { input_code, expected_sku } = req.body; 
  if (!input_code || !expected_sku) return res.status(400).json({ valid: false, message: "Datos incompletos" });

  const cleanInput = input_code.toString().trim();
  const cleanSku = expected_sku.toString().trim();

  try {
    // 1. Validación Directa ID
    if (cleanInput === cleanSku) {
       return res.status(200).json({ valid: true, type: 'id_directo' });
    }

    // 2. Validación Código de Barras (Tabla SIESA)
    const { data: barcodeMatch, error } = await supabase
      .from('siesa_codigos_barras')
      .select('id')
      .eq('codigo_barras', cleanInput)
      .eq('f120_id', cleanSku)
      .maybeSingle();

    if (error) throw error;

    if (barcodeMatch) {
      return res.status(200).json({ valid: true, type: 'codigo_barras' });
    }

    return res.status(200).json({ valid: false });

  } catch (error) {
    console.error("Error validando SIESA:", error);
    res.status(500).json({ valid: false, error: "Error de servidor" });
  }
};

// ==========================================
// 5. MÉTODOS DE APOYO (ADMIN)
// ==========================================

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