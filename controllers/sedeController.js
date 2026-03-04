/**
 * CONTROLADOR DE SEDES
 *
 * CRUD para gestionar sedes + asignación de usuarios a sedes
 * + endpoint de diagnóstico para descubrir el campo de sede en WooCommerce
 */

const { supabase } = require("../services/supabaseClient");
const WooCommerce = require("../services/wooService");

// Multi-sede WooCommerce (WordPress Multisite)
const { getOrderFromAnySede } = require("../services/wooMultiService");
const {
  getAllSedes,
  invalidateSedeCache,
  extractSedeFromOrder,
  WOO_SEDE_META_KEYS,
  getSedeFromWooOrder,
} = require("../services/sedeConfig");

// =========================================================
// 1. LISTAR SEDES
// =========================================================
exports.listSedes = async (req, res) => {
  try {
    const sedes = await getAllSedes();
    res.status(200).json(sedes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// =========================================================
// 2. CREAR SEDE
// =========================================================
exports.createSede = async (req, res) => {
  const {
    nombre,
    slug,
    ciudad,
    direccion,
    telefono,
    woo_meta_match,
    config_woo,
  } = req.body;

  try {
    if (!nombre || !slug) {
      return res.status(400).json({ error: "nombre y slug son obligatorios" });
    }

    const { data, error } = await supabase
      .from("wc_sedes")
      .insert([
        {
          nombre,
          slug: slug.toLowerCase().replace(/\s+/g, "-"),
          ciudad,
          direccion,
          telefono,
          woo_meta_match: woo_meta_match || {},
          config_woo: config_woo || {},
        },
      ])
      .select()
      .single();

    if (error) throw error;

    invalidateSedeCache();
    res.status(201).json({ message: "Sede creada exitosamente", sede: data });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(400).json({ error: "Ya existe una sede con ese slug" });
    }
    res.status(500).json({ error: error.message });
  }
};

// =========================================================
// 3. ACTUALIZAR SEDE
// =========================================================
exports.updateSede = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  try {
    if (!id) return res.status(400).json({ error: "Falta id de sede" });

    // No permitir cambiar el id
    delete updateData.id;
    delete updateData.created_at;

    const { data, error } = await supabase
      .from("wc_sedes")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    invalidateSedeCache();
    res.status(200).json({ message: "Sede actualizada", sede: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// =========================================================
// 4. DESACTIVAR SEDE (soft delete)
// =========================================================
exports.deactivateSede = async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from("wc_sedes")
      .update({ activa: false })
      .eq("id", id);

    if (error) throw error;

    invalidateSedeCache();
    res.status(200).json({ message: "Sede desactivada" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// =========================================================
// 5. ASIGNAR PICKER A SEDE
// =========================================================
exports.assignPickerToSede = async (req, res) => {
  const { picker_id, sede_id } = req.body;

  try {
    if (!picker_id || !sede_id) {
      return res
        .status(400)
        .json({ error: "picker_id y sede_id son obligatorios" });
    }

    const { error } = await supabase
      .from("wc_pickers")
      .update({ sede_id })
      .eq("id", picker_id);

    if (error) throw error;

    // También actualizar en profiles si existe el correo vinculado
    const { data: picker } = await supabase
      .from("wc_pickers")
      .select("email")
      .eq("id", picker_id)
      .single();

    if (picker && picker.email) {
      await supabase
        .from("profiles")
        .update({ sede_id })
        .eq("correo", picker.email);
    }

    res.status(200).json({ message: "Picker asignado a sede correctamente" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// =========================================================
// 6. ASIGNAR USUARIO (PROFILE) A SEDE
// =========================================================
exports.assignUserToSede = async (req, res) => {
  const { user_id, sede_id } = req.body;

  try {
    if (!user_id || !sede_id) {
      return res
        .status(400)
        .json({ error: "user_id y sede_id son obligatorios" });
    }

    const { error } = await supabase
      .from("profiles")
      .update({ sede_id })
      .eq("user_id", user_id);

    if (error) throw error;

    res.status(200).json({ message: "Usuario asignado a sede correctamente" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// =========================================================
// 7. DIAGNÓSTICO: Detectar campo de sede en un pedido real
// =========================================================
exports.diagnosticarSedePedido = async (req, res) => {
  try {
    const orderId = req.params.id;
    // Multi-sede: buscar el pedido en cualquier sede
    const result = await getOrderFromAnySede(orderId);
    if (!result) return res.status(404).json({ error: "Pedido no encontrado en ninguna sede" });
    const order = result.order;

    // Intentar detectar automáticamente
    const rawSedeValue = extractSedeFromOrder(order);
    const sedeResult = await getSedeFromWooOrder(order);

    // Buscar TODOS los meta_data para mostrar al developer
    const allMeta = (order.meta_data || []).map((m) => ({
      key: m.key,
      value: m.value,
      es_candidato_sede:
        WOO_SEDE_META_KEYS.includes(m.key) ||
        WOO_SEDE_META_KEYS.includes("_" + m.key),
    }));

    // Meta en shipping_lines
    const shippingMeta = (order.shipping_lines || []).flatMap((s) =>
      (s.meta_data || []).map((m) => ({
        source: `shipping_line[${s.method_id}]`,
        key: m.key,
        value: m.value,
      })),
    );

    // Meta en fee_lines
    const feeMeta = (order.fee_lines || []).flatMap((f) =>
      (f.meta_data || []).map((m) => ({
        source: `fee_line`,
        key: m.key,
        value: m.value,
      })),
    );

    res.status(200).json({
      mensaje: "🔍 DIAGNÓSTICO DE SEDE - Datos del Pedido",
      pedido_id: order.id,
      status: order.status,
      fecha: order.date_created,

      // Lo que el sistema detectó
      deteccion_automatica: {
        sede_raw_value: rawSedeValue,
        sede_id_resuelto: sedeResult.sede_id,
        encontrado: !!rawSedeValue,
        instruccion: rawSedeValue
          ? `✅ Se encontró el valor "${rawSedeValue}". Asegúrate de que coincida con el campo woo_meta_match de alguna sede.`
          : "❌ No se detectó campo de sede. Revisa los meta_data abajo y busca cuál contiene la sede.",
      },

      // Datos crudos para inspeccionar
      todos_los_meta_data: allMeta,
      shipping_lines_meta: shippingMeta,
      fee_lines_meta: feeMeta,

      // Info útil del pedido
      billing: {
        nombre: `${order.billing?.first_name} ${order.billing?.last_name}`,
        ciudad: order.billing?.city,
        direccion: order.billing?.address_1,
      },
      shipping: {
        nombre: `${order.shipping?.first_name} ${order.shipping?.last_name}`,
        ciudad: order.shipping?.city,
        direccion: order.shipping?.address_1,
      },

      // Campos clave a buscar
      campos_probados: WOO_SEDE_META_KEYS,

      nota:
        "Si ves un campo que contiene la sede pero NO está en 'campos_probados', " +
        "agrégalo al array WOO_SEDE_META_KEYS en services/sedeConfig.js",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// =========================================================
// 8. OBTENER ESTADÍSTICAS POR SEDE
// =========================================================
exports.getSedesStats = async (req, res) => {
  try {
    const sedes = await getAllSedes();

    const statsPromises = sedes.map(async (sede) => {
      // Contar pickers
      const { count: pickersCount } = await supabase
        .from("wc_pickers")
        .select("id", { count: "exact", head: true })
        .eq("sede_id", sede.id);

      // Contar sesiones activas
      const { count: activeSessions } = await supabase
        .from("wc_picking_sessions")
        .select("id", { count: "exact", head: true })
        .eq("sede_id", sede.id)
        .eq("estado", "en_proceso");

      // Contar sesiones totales
      const { count: totalSessions } = await supabase
        .from("wc_picking_sessions")
        .select("id", { count: "exact", head: true })
        .eq("sede_id", sede.id);

      return {
        ...sede,
        stats: {
          pickers: pickersCount || 0,
          sesiones_activas: activeSessions || 0,
          sesiones_totales: totalSessions || 0,
        },
      };
    });

    const sedesConStats = await Promise.all(statsPromises);
    res.status(200).json(sedesConStats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
