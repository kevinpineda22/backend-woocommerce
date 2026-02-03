const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");
// Importamos tu mapeador (el Juez para filtrar sugerencias incorrectas)
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
          id: item.id, // ID referencia de línea
          product_id: item.product_id,
          name: item.name,
          sku: item.sku, // Importante para validación SIESA
          image_src: item.image?.src || "", 
          // NUEVO: Precio para mostrar en la app
          price: parseFloat(item.price || 0),
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
// 2. ACCIONES DEL PICKER (CORE)
// ==========================================

exports.registerAction = async (req, res) => {
  const { 
    id_sesion, id_producto_original, nombre_producto_original, 
    accion, peso_real, datos_sustituto 
  } = req.body;

  try {
    const now = new Date();
    
    // Vincular log a una asignación válida
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
// 3. BÚSQUEDA INTELIGENTE CON FILTRO DE PASILLO (SOLUCIÓN ARROZ VS TOSTADA)
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
            
            // 2. DETERMINAR EL "ADN" DEL PRODUCTO (Pasillo)
            // Esto nos dirá si es "Granos" (Pasillo 1) o "Galletas" (Pasillo 5)
            const infoOriginal = obtenerInfoPasillo(original.categories, original.name);
            console.log(`\n🔍 [IA PASILLOS] Original: "${original.name}" -> Pasillo Detectado: ${infoOriginal.pasillo}`);

            // 3. EXTRAER PALABRA CLAVE
            const cleanName = original.name.trim();
            let masterKeyword = cleanName.split(' ')[0]; 
            // Si la primera palabra es corta (ej: "De"), tomar la segunda
            if (masterKeyword.length <= 2 && cleanName.split(' ').length > 1) {
                masterKeyword = cleanName.split(' ')[1];
            }
            masterKeyword = masterKeyword.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, ""); 

            // 4. BUSCAR EN WOOCOMMERCE POR NOMBRE (Amplio)
            const { data: searchResults } = await WooCommerce.get("products", {
                search: masterKeyword,
                per_page: 50, // Traemos bastantes para poder filtrar
                status: 'publish',
                stock_status: 'instock'
            });

            // 5. FILTRADO ESTRICTO DE PASILLO
            const minPrice = price * 0.5; 
            const maxPrice = price * 1.5; 

            products = searchResults.filter(p => {
                // A. No ser el mismo
                if (p.id === parseInt(original_id)) return false;

                // B. Filtro de Precio
                const pPrice = parseFloat(p.price || 0);
                if (price > 0 && pPrice > 0) {
                    if (pPrice < minPrice || pPrice > maxPrice) return false;
                }

                // C. Filtro de Nombre Básico
                if (!p.name.toLowerCase().includes(masterKeyword.toLowerCase())) return false;

                // D. EL FILTRO DE ORO: Validar Pasillo
                // Clasificamos al candidato usando la misma lógica que al original
                const infoCandidato = obtenerInfoPasillo(p.categories, p.name);
                
                // Si el original es Pasillo 1 (Arroz) y el candidato es Pasillo 6 (Tostadas), ADIÓS.
                // Nota: "Otros" se permite como comodín si el original es "Otros".
                if (infoOriginal.pasillo !== "Otros" && infoOriginal.pasillo !== infoCandidato.pasillo) {
                    // console.log(`   ❌ Descartado: ${p.name} (Es Pasillo ${infoCandidato.pasillo}, buscamos Pasillo ${infoOriginal.pasillo})`);
                    return false;
                }

                return true;
            });
            
            console.log(`   ✨ Sugerencias válidas encontradas: ${products.length}`);
        } 
        
        // --- MODO MANUAL (Picker escribe) ---
        else if (query) {
            console.log(`\n🔍 [BUSQUEDA MANUAL] Query: "${query}"`);
            const { data: searchResults } = await WooCommerce.get("products", {
                search: query,
                per_page: 20,
                status: 'publish'
            });
            products = searchResults;
        }

        // Mapeo Final Limpio
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
    const { data: barcodeMatch } = await supabase
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