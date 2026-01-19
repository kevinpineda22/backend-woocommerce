const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");
const { obtenerInfoPasillo } = require("../tools/mapeadorPasillos");

// 1. Obtener pedidos pendientes (CRUZADO CON SUPABASE)
exports.getPendingOrders = async (req, res) => {
  try {
    const { data: wcOrders } = await WooCommerce.get("orders", {
      status: "processing",
      per_page: 50,
      order: "asc",
    });

    const { data: activeAssignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id_pedido, nombre_picker, fecha_inicio, reporte_snapshot")
      .eq("estado_asignacion", "en_proceso");

    const assignmentMap = {};
    activeAssignments.forEach((a) => {
      assignmentMap[a.id_pedido] = a;
    });

    const mergedOrders = wcOrders.map((order) => {
      const assignment = assignmentMap[order.id];
      return {
        ...order,
        is_assigned: !!assignment,
        assigned_to: assignment ? assignment.nombre_picker : null,
        started_at: assignment ? assignment.fecha_inicio : null,
        reporte_progress: assignment ? assignment.reporte_snapshot : null, // Progreso en tiempo real
      };
    });

    res.status(200).json(mergedOrders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener pedidos cruzados" });
  }
};

// 2. Obtener lista de pickers (con Sincronización Automática)
exports.getPickers = async (req, res) => {
  const { email } = req.query;
  try {
    // --- SYNC START: Asegurar que todos los 'picker' de profiles existan en wc_pickers ---
    if (!email) {
      const { data: profiles, error: pError } = await supabase
        .from("profiles")
        .select("correo, nombre")
        .eq("role", "picker");

      if (!pError && profiles) {
        const { data: existingPickers } = await supabase
          .from("wc_pickers")
          .select("email");

        const existingEmails = new Set(
          existingPickers?.map((p) => p.email) || []
        );
        const missingProfiles = profiles.filter(
          (p) => !existingEmails.has(p.correo)
        );

        if (missingProfiles.length > 0) {
          console.log(
            `Sincronizando ${missingProfiles.length} nuevos pickers...`
          );
          const newPickers = missingProfiles.map((p) => ({
            nombre_completo: p.nombre || "Nuevo Picker",
            email: p.correo,
            estado_picker: "disponible",
          }));

          const { error: insertError } = await supabase
            .from("wc_pickers")
            .insert(newPickers);

          if (insertError) console.error("Error sync pickers:", insertError);
        }
      }
    }
    // --- SYNC END ---

    let query = supabase
      .from("wc_pickers")
      .select("*")
      .order("nombre_completo", { ascending: true });

    if (email) query = query.eq("email", email);

    const { data, error } = await query;
    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    console.error("Error getPickers:", error);
    res.status(500).json({ error: error.message });
  }
};

// 3. Asignar pedido
exports.assignOrder = async (req, res) => {
  const { id_pedido, id_picker, nombre_picker } = req.body;
  try {
    const { data, error } = await supabase
      .from("wc_asignaciones_pedidos")
      .insert([
        {
          id_pedido,
          id_picker,
          nombre_picker,
          estado_asignacion: "en_proceso",
          fecha_inicio: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from("wc_pickers")
      .update({
        estado_picker: "picking",
        id_pedido_actual: id_pedido,
      })
      .eq("id", id_picker);

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 3.5 Actualizar Progreso (Ping desde el Picker) + LOGGING EN TIEMPO REAL
exports.updateProgress = async (req, res) => {
  // --- DEBUG LOG START: Confirmación visual de que la ruta funciona ---
  console.log("--> [BACKEND] Recibiendo ping de progreso...");
  // -------------------------------------------------------------------

  const { id_pedido, reporte_items } = req.body;
  try {
    // 1. Obtener estado actual de la asignación
    const { data: assignment } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, reporte_snapshot")
      .eq("id_pedido", id_pedido)
      .eq("estado_asignacion", "en_proceso")
      .maybeSingle();

    if (!assignment) {
      console.log("No se encontró asignación activa para pedido:", id_pedido);
      return res
        .status(404)
        .json({ error: "Asignación no encontrada o inactiva" });
    }

    // 2. Diff Logic: Detectar cambios para LOGS
    const oldSnapshot = assignment.reporte_snapshot || {
      recolectados: [],
      retirados: [],
    };
    const newSnapshot = reporte_items || { recolectados: [], retirados: [] };
    const logsToInsert = [];
    const now = new Date(); // Timestamp real del evento

    // Helper: Encuentra items en newList que NO están en oldList (por ID)
    const getNewItems = (oldList, newList) => {
      const oldIds = new Set((oldList || []).map((i) => i.id));
      return (newList || []).filter((i) => !oldIds.has(i.id));
    };

    const newCollected = getNewItems(
      oldSnapshot.recolectados,
      newSnapshot.recolectados
    );
    const newRemoved = getNewItems(
      oldSnapshot.retirados,
      newSnapshot.retirados
    );

    // Logs Recolectados
    newCollected.forEach((item) => {
      console.log(`   + Nuevo item recolectado: ${item.name}`); // Log consola
      logsToInsert.push({
        id_asignacion: assignment.id,
        id_pedido: id_pedido,
        id_producto: item.id,
        nombre_producto: item.name,
        accion: "recolectado",
        fecha_registro: now,
        pasillo: item.pasillo,
      });
    });

    // Logs Retirados
    newRemoved.forEach((item) => {
      console.log(`   - Nuevo item retirado: ${item.name} (${item.reason})`); // Log consola
      logsToInsert.push({
        id_asignacion: assignment.id,
        id_pedido: id_pedido,
        id_producto: item.id,
        nombre_producto: item.name,
        accion: "retirado",
        motivo: item.reason,
        fecha_registro: now,
        pasillo: item.pasillo,
      });
    });

    // 3. Insertar Logs Incrementales
    if (logsToInsert.length > 0) {
      const { error: logError } = await supabase
        .from("wc_log_picking")
        .insert(logsToInsert);

      if (logError) console.error("Error insertando logs realtime:", logError);
      else console.log(`   ✅ ${logsToInsert.length} logs guardados en DB.`);
    }

    // 4. Actualizar Snapshot Global
    const { error } = await supabase
      .from("wc_asignaciones_pedidos")
      .update({ reporte_snapshot: reporte_items }) // Guardamos el estado actual
      .eq("id", assignment.id);

    if (error) throw error;
    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("Error updating progress:", error);
    res.status(500).json({ error: "Error updating progress" });
  }
};

// 4. Detalle del pedido
exports.getOrderById = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Obtener pedido de WooCommerce
    const { data: order } = await WooCommerce.get(`orders/${id}`);

    // 2. Intentar obtener el Snapshot de la asiganción MÁS RECIENTE
    const { data: asignacion } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, reporte_snapshot, estado_asignacion")
      .eq("id_pedido", id)
      .in("estado_asignacion", ["completado", "en_proceso"])
      .order("fecha_inicio", { ascending: false }) // Priorizar el último intento
      .limit(1)
      .maybeSingle();

    let reporteFinal = null;

    if (asignacion && asignacion.reporte_snapshot) {
      reporteFinal = asignacion.reporte_snapshot;
    } else if (!asignacion) {
      // Opción B: No hay snapshot reciente, buscar logs antiguos
      const { data: logs } = await supabase
        .from("wc_log_picking")
        .select("*")
        .eq("id_pedido", id);

      if (logs && logs.length > 0) {
        reporteFinal = { recolectados: [], retirados: [] };
        logs.forEach((log) => {
          const item = { id: log.id_producto, name: log.nombre_producto };
          if (log.accion === "recolectado")
            reporteFinal.recolectados.push(item);
          if (log.accion === "retirado")
            reporteFinal.retirados.push({ ...item, reason: log.motivo });
        });
      }
    }

    // 3. Inyectar metadatos de productos (imágenes, pasillos)
    const items = await Promise.all(
      order.line_items.map(async (item) => {
        if (!item.product_id) return { ...item, pasillo: "N/A", priority: 99 };
        try {
          const { data: prod } = await WooCommerce.get(
            `products/${item.product_id}`
          );
          const info = obtenerInfoPasillo(prod.categories, prod.name);

          // Filtramos categorías visuales
          const categoriasVisuales = prod.categories
            .map((c) => c.name)
            .filter((name) => {
              const normalizado = name
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
              return !normalizado.includes("despensa");
            });

          // BUSQUEDA DE CÓDIGO DE BARRAS
          let codigoBarras =
            item.global_unique_id || prod.global_unique_id || null;

          if (!codigoBarras && prod.meta_data) {
            const meta = prod.meta_data.find((m) =>
              ["barcode", "_barcode", "ean", "_ean", "gtin", "_gtin"].includes(
                m.key.toLowerCase()
              )
            );
            if (meta) codigoBarras = meta.value;
          }
          if (!codigoBarras && prod.attributes) {
            const attr = prod.attributes.find((a) =>
              ["ean", "barcode", "codigo de barras"].includes(
                a.name.toLowerCase()
              )
            );
            if (attr && attr.options && attr.options.length > 0)
              codigoBarras = attr.options[0];
          }

          return {
            ...item,
            image_src: prod.images[0]?.src,
            pasillo: info.pasillo,
            prioridad: info.prioridad,
            categorias:
              categoriasVisuales.length > 0
                ? categoriasVisuales
                : prod.categories.map((c) => c.name),
            barcode: codigoBarras || "",
          };
        } catch (e) {
          return item;
        }
      })
    );

    order.line_items = items.sort((a, b) => a.prioridad - b.prioridad);

    // Inyectamos el reporte encontrado
    if (reporteFinal) {
      order.reporte_items = reporteFinal;
    }

    if (asignacion && asignacion.id) {
      order.current_assignment_id = asignacion.id;
    }

    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ error: "Error obteniendo detalle" });
  }
};

// 5. Finalizar Recolección
exports.completePicking = async (req, res) => {
  const { id_pedido, id_picker, reporte_items } = req.body;
  try {
    const now = new Date();

    // Validar asignación activa
    const { data: asignaciones } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id, fecha_inicio")
      .eq("id_pedido", id_pedido)
      .eq("estado_asignacion", "en_proceso")
      .limit(1);

    const asignacion =
      asignaciones && asignaciones.length > 0 ? asignaciones[0] : null;

    // Calcular duración real
    let duration = 0;
    if (asignacion && asignacion.fecha_inicio) {
      const diff = (now - new Date(asignacion.fecha_inicio)) / 1000;
      duration = diff > 0 ? Math.floor(diff) : 0;
    }

    const updatePayload = {
      estado_asignacion: "completado",
      fecha_fin: now,
      tiempo_total_segundos: duration,
      reporte_snapshot: reporte_items || null,
    };

    let asignacionId = null;

    if (asignacion) {
      asignacionId = asignacion.id;
      await supabase
        .from("wc_asignaciones_pedidos")
        .update(updatePayload)
        .eq("id", asignacionId);
    } else {
      const { data: newAsign } = await supabase
        .from("wc_asignaciones_pedidos")
        .insert([
          {
            id_pedido: id_pedido,
            id_picker: id_picker || null,
            fecha_inicio: now,
            ...updatePayload,
          },
        ])
        .select("id")
        .single();

      if (newAsign) asignacionId = newAsign.id;
    }

    // 2. Auditoría: Logs finales
    if (reporte_items && asignacionId) {
      const { data: existingLogs } = await supabase
        .from("wc_log_picking")
        .select("id_producto, accion")
        .eq("id_asignacion", asignacionId);

      const loggedSet = new Set(
        (existingLogs || []).map((l) => `${l.id_producto}-${l.accion}`)
      );

      const logsToInsert = [];

      const procesarLista = (lista, accion) => {
        if (!lista) return;
        lista.forEach((item) => {
          if (!loggedSet.has(`${item.id}-${accion}`)) {
            logsToInsert.push({
              id_asignacion: asignacionId,
              id_pedido: id_pedido,
              id_producto: item.id,
              nombre_producto: item.name,
              accion: accion,
              motivo: item.reason || null,
              pasillo: item.pasillo || null,
              fecha_registro: new Date(),
              device_timestamp: item.device_timestamp || null,
            });
          }
        });
      };

      procesarLista(reporte_items.recolectados, "recolectado");
      procesarLista(reporte_items.retirados, "retirado");

      if (logsToInsert.length > 0) {
        const { error: logError } = await supabase
          .from("wc_log_picking")
          .insert(logsToInsert);
        if (logError)
          console.error("Error guardando logs de auditoría:", logError);
      }
    }

    await supabase
      .from("wc_pickers")
      .update({ estado_picker: "disponible", id_pedido_actual: null })
      .eq("id", id_picker);

    res.status(200).json({ message: "Orden finalizada correctamente" });
  } catch (error) {
    console.error("Error finalizando orden:", error);
    res.status(500).json({ error: error.message });
  }
};

// 6. Obtener Historial
exports.getHistory = async (req, res) => {
  const { id_picker } = req.query;

  try {
    let query = supabase
      .from("wc_asignaciones_pedidos")
      .select("*")
      .eq("estado_asignacion", "completado")
      .order("fecha_fin", { ascending: false });

    if (id_picker) {
      query = query.eq("id_picker", id_picker);
    } else {
      query = query.limit(50);
    }

    const { data, error } = await query;

    if (error) throw error;

    const uniqueMap = new Map();
    const uniqueData = [];

    for (const item of data) {
      if (!uniqueMap.has(item.id_pedido)) {
        uniqueMap.set(item.id_pedido, true);
        uniqueData.push(item);
      }
    }

    const formattedData = uniqueData.map((item) => {
      const seconds = item.tiempo_total_segundos || 0;
      const totalMinutes = Math.floor(seconds / 60);

      let duracionTexto = `${totalMinutes} min`;
      if (totalMinutes > 60) {
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        duracionTexto = `${hours} h ${mins} min`;
      }

      return {
        ...item,
        tiempo_formateado: duracionTexto,
      };
    });

    res.status(200).json(formattedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 7. Cancelar/Liberar Asignación
exports.cancelAssignment = async (req, res) => {
  const { id_picker } = req.body;

  try {
    const { data: picker, error: recError } = await supabase
      .from("wc_pickers")
      .select("id_pedido_actual")
      .eq("id", id_picker)
      .single();

    if (recError) throw recError;

    const id_pedido = picker.id_pedido_actual;

    if (id_pedido) {
      await supabase
        .from("wc_asignaciones_pedidos")
        .update({
          estado_asignacion: "cancelado",
          fecha_fin: new Date(),
        })
        .eq("id_pedido", id_pedido)
        .eq("estado_asignacion", "en_proceso");
    }

    await supabase
      .from("wc_pickers")
      .update({
        estado_picker: "disponible",
        id_pedido_actual: null,
      })
      .eq("id", id_picker);

    res
      .status(200)
      .json({ message: "Asignación cancelada y picker liberada" });
  } catch (error) {
    console.error("Error cancelando asignación:", error);
    res.status(500).json({ error: error.message });
  }
};