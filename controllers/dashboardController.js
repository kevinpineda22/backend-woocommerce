const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");
const { obtenerInfoPasillo } = require("../tools/mapeadorPasillos");
const { agruparItemsParaPicking } = require("./pickingUtils");

exports.getActiveSessionsDashboard = async (req, res) => {
  try {
    const { data: sessions, error } = await supabase
      .from("wc_picking_sessions")
      .select(
        `id, fecha_inicio, id_picker, ids_pedidos, snapshot_pedidos, wc_pickers!wc_picking_sessions_picker_fkey ( nombre_completo, email )`,
      )
      .eq("estado", "en_proceso");

    if (error) throw error;

    const dashboardData = await Promise.all(
      sessions.map(async (sess) => {
        let orders =
          sess.snapshot_pedidos && sess.snapshot_pedidos.length > 0
            ? sess.snapshot_pedidos
            : (
                await Promise.all(
                  sess.ids_pedidos.map((id) => WooCommerce.get(`orders/${id}`)),
                )
              ).map((r) => r.data);

        const itemsUnificados = agruparItemsParaPicking(orders);
        const activeItems = itemsUnificados.filter((i) => !i.is_removed);
        const totalItems = activeItems.length;

        const { data: logs } = await supabase
          .from("wc_log_picking")
          .select(
            "id_producto, accion, es_sustituto, fecha_registro, nombre_producto",
          )
          .in(
            "id_producto",
            itemsUnificados.map((i) => i.product_id),
          )
          .gte("fecha_registro", sess.fecha_inicio);

        const recolectados = logs.filter(
          (l) => l.accion === "recolectado" && !l.es_sustituto,
        ).length;
        const sustituidos = logs.filter((l) => l.es_sustituto).length;
        const completados = recolectados + sustituidos;
        const percentage =
          totalItems > 0 ? Math.round((completados / totalItems) * 100) : 0;

        let currentLocation = "Inicio";
        if (logs.length > 0) {
          const lastLog = logs.sort(
            (a, b) => new Date(b.fecha_registro) - new Date(a.fecha_registro),
          )[0];
          const infoPasillo = obtenerInfoPasillo([], lastLog.nombre_producto);
          currentLocation =
            infoPasillo.pasillo !== "Otros"
              ? `Pasillo ${infoPasillo.pasillo}`
              : "General";
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
      }),
    );
    res.status(200).json(dashboardData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPendingOrders = async (req, res) => {
  try {
    const { data: wcOrders } = await WooCommerce.get("orders", {
      status: "processing",
      per_page: 50,
    });
    const { data: activeAssignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id_pedido")
      .eq("estado_asignacion", "en_proceso");
    const assignedIds = new Set(activeAssignments.map((a) => a.id_pedido));
    const cleanOrders = wcOrders.map((order) => ({
      ...order,
      is_assigned: assignedIds.has(order.id),
    }));
    res.status(200).json(cleanOrders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.getPickers = async (req, res) => {
  const { email } = req.query;
  let query = supabase
    .from("wc_pickers")
    .select("*")
    .order("nombre_completo", { ascending: true });
  if (email) query = query.eq("email", email);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json(data);
};

exports.getHistorySessions = async (req, res) => {
  try {
    const { data: sessions, error } = await supabase
      .from("wc_picking_sessions")
      .select(
        `id, fecha_inicio, fecha_fin, estado, ids_pedidos, wc_pickers!wc_picking_sessions_picker_fkey ( nombre_completo, email )`,
      )
      .eq("estado", "completado")
      .order("fecha_fin", { ascending: false })
      .limit(50);

    if (error) throw error;

    const historyData = sessions.map((sess) => {
      const start = new Date(sess.fecha_inicio);
      const end = new Date(sess.fecha_fin);
      const durationMin = Math.round((end - start) / 60000);
      const optionsDate = {
        timeZone: "America/Bogota",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      };
      const optionsTime = {
        timeZone: "America/Bogota",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      };

      return {
        id: sess.id,
        picker: sess.wc_pickers?.nombre_completo || "Desconocido",
        pedidos: sess.ids_pedidos,
        fecha: end.toLocaleDateString("es-CO", optionsDate),
        hora_fin: end.toLocaleTimeString("es-CO", optionsTime),
        duracion: `${durationMin} min`,
      };
    });
    res.status(200).json(historyData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// =========================================================
// ✅ FUNCIÓN DE AUDITORÍA (CON FIX PARA UUID)
// =========================================================
exports.getSessionLogsDetail = async (req, res) => {
  let { session_id } = req.query;

  try {
    if (!session_id) return res.status(400).json({ error: "Falta session_id" });

    // 1. DETECCIÓN INTELIGENTE DE ID
    // Si el ID tiene menos de 30 caracteres (ej: "48093f6e"), buscamos el UUID real
    if (session_id.length < 30) {
        // Búsqueda en memoria de las últimas 200 sesiones para evitar problemas de casting UUID::text en Supabase
        const { data: recentSessions, error: listError } = await supabase
            .from("wc_picking_sessions")
            .select("id")
            .order("fecha_inicio", { ascending: false })
            .limit(200);

        if (listError) {
            console.error("Error listando sesiones:", listError);
            return res.status(500).json({ error: "Error buscando la sesión." });
        }

        const match = recentSessions.find(s => s.id.toLowerCase().startsWith(session_id.toLowerCase()));

        if (!match) {
            return res.status(404).json({ error: "No se encontró ninguna sesión reciente con ese código corto." });
        }
        
        session_id = match.id;
    }

    // 2. Consulta Original (Ahora session_id es un UUID válido)
    const { data: assignments } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("id")
      .eq("id_sesion", session_id);

    if (!assignments || assignments.length === 0) {
      return res.status(200).json([]);
    }

    const assignIds = assignments.map((a) => a.id);

    const { data: logs, error } = await supabase
      .from("wc_log_picking")
      .select(
        `
            *,
            wc_asignaciones_pedidos ( nombre_picker )
        `,
      )
      .in("id_asignacion", assignIds)
      .order("fecha_registro", { ascending: true });

    if (error) throw error;

    res.status(200).json(logs);
  } catch (error) {
    console.error("Error en Auditoría:", error.message);
    if (error.code === "22P02") {
      return res.status(400).json({ error: "Formato de ID inválido." });
    }
    res.status(500).json({ error: error.message });
  }
};
