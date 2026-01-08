const WooCommerce = require("../services/wooService");
const { supabase } = require("../services/supabaseClient");
const { obtenerInfoPasillo } = require("../tools/mapeadorPasillos");
const dayjs = require("dayjs");

// 0. Obtener pedidos pendientes
exports.getPendingOrders = async (req, res) => {
  try {
    const { data } = await WooCommerce.get("orders", {
      status: "pending,processing", // Ajusta seg�n tus estados
      per_page: 50,
    });
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener pedidos pendientes" });
  }
};

// 1. Obtener lista de recolectoras desde Supabase (ENRIQUECIDO PARA VISTA MOVIL)
exports.getRecolectoras = async (req, res) => {
  const { email } = req.query;

  try {
    let query = supabase
      .from("wc_recolectoras")
      .select("*")
      .order("nombre_completo", { ascending: true });

    if (email) {
      query = query.eq("email", email);
    }

    const { data: recolectoras, error } = await query;

    if (error) throw error;

    // Enriquecer con fecha de inicio si est�n ocupadas (para el temporizador)
    const recolectorasEnriquecidas = await Promise.all(
      recolectoras.map(async (rec) => {
        if (rec.estado_recolectora === "recolectando" && rec.id_pedido_actual) {
          const { data: asignacion } = await supabase
            .from("wc_asignaciones_pedidos")
            .select("fecha_inicio")
            .eq("id_pedido", rec.id_pedido_actual)
            .eq("id_recolectora", rec.id)
            .eq("estado_asignacion", "en_proceso")
            .limit(1)
            .single();

          if (asignacion) {
            return { ...rec, fecha_inicio_orden: asignacion.fecha_inicio };
          }
        }
        return rec;
      })
    );

    res.status(200).json(recolectorasEnriquecidas);
  } catch (error) {
    res.status(500).json({
      error: "Error al obtener recolectoras",
      details: error.message,
    });
  }
};

// 2. Asignar un pedido a una recolectora
exports.assignOrder = async (req, res) => {
  const { id_pedido, id_recolectora, nombre_recolectora } = req.body;

  try {
    // A. Crear registro en la tabla de asignaciones
    const { data: asignacion, error: errorAsignacion } = await supabase
      .from("wc_asignaciones_pedidos")
      .insert([
        {
          id_pedido,
          id_recolectora,
          nombre_recolectora,
          estado_asignacion: "en_proceso",
        },
      ])
      .select()
      .single();

    if (errorAsignacion) throw errorAsignacion;

    // B. Actualizar estado de la recolectora
    const { error: errorRepo } = await supabase
      .from("wc_recolectoras")
      .update({
        estado_recolectora: "recolectando",
        id_pedido_actual: id_pedido,
      })
      .eq("id", id_recolectora);

    if (errorRepo) throw errorRepo;

    res.status(200).json({ message: "Pedido asignado con �xito", asignacion });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error en la asignaci�n", details: error.message });
  }
};

// 3. Obtener detalle del pedido ORDENADO POR PASILLOS
exports.getOrderById = async (req, res) => {
  const { id } = req.params;
  try {
    const { data: order } = await WooCommerce.get(`orders/${id}`);

    const itemsEnriquecidos = await Promise.all(
      order.line_items.map(async (item) => {
        try {
          if (!item.product_id)
            return { ...item, pasillo: "S/N", prioridad: 99 };

          const { data: product } = await WooCommerce.get(
            `products/${item.product_id}`
          );
          const infoPasillo = obtenerInfoPasillo(product.categories);

          return {
            ...item,
            image_src: product.images?.[0]?.src || null,
            pasillo: infoPasillo.pasillo,
            prioridad: infoPasillo.prioridad,
            categorias: product.categories.map((c) => c.name),
          };
        } catch (err) {
          return { ...item, pasillo: "Error", prioridad: 100 };
        }
      })
    );

    // Ordenamos por la prioridad de tu ruta log�stica
    order.line_items = itemsEnriquecidos.sort(
      (a, b) => a.prioridad - b.prioridad
    );

    res.status(200).json(order);
  } catch (error) {
    res.status(500).json({ error: "Error al procesar el pedido detallado" });
  }
};

// 4. Finalizar Recolecci�n
exports.completeCollection = async (req, res) => {
  const { id_pedido, id_recolectora } = req.body;

  try {
    const fechaFin = new Date();

    // 0. Obtener fecha de inicio para calcular duraci�n
    const { data: asignacionExistente } = await supabase
      .from("wc_asignaciones_pedidos")
      .select("fecha_inicio")
      .eq("id_pedido", id_pedido)
      .eq("id_recolectora", id_recolectora)
      .eq("estado_asignacion", "en_proceso")
      .single();

    let segundosTotales = 0;
    if (asignacionExistente && asignacionExistente.fecha_inicio) {
      const inicio = new Date(asignacionExistente.fecha_inicio);
      segundosTotales = Math.floor((fechaFin - inicio) / 1000);
    }

    // A. Marcar asignaci�n como completada y guardar tiempo
    const { error: errorAsignacion } = await supabase
      .from("wc_asignaciones_pedidos")
      .update({
        estado_asignacion: "completado",
        fecha_fin: fechaFin.toISOString(),
        tiempo_total_segundos: segundosTotales,
      })
      .eq("id_pedido", id_pedido)
      .eq("id_recolectora", id_recolectora);

    if (errorAsignacion) throw errorAsignacion;

    // B. Liberar recolectora
    const { error: errorRecolectora } = await supabase
      .from("wc_recolectoras")
      .update({
        estado_recolectora: "disponible",
        id_pedido_actual: null,
      })
      .eq("id", id_recolectora);

    if (errorRecolectora) throw errorRecolectora;

    res.status(200).json({ message: "Recolecci�n finalizada correctamente" });
  } catch (error) {
    res.status(500).json({
      error: "Error al finalizar recolecci�n",
      details: error.message,
    });
  }
};
