
const { supabase } = require("../services/supabaseClient");

async function cleanupPickers() {
  console.log("🧹 Iniciando limpieza de pickers duplicados...");

  try {
    // 1. Obtener todos los pickers
    const { data: pickers, error } = await supabase
      .from("wc_pickers")
      .select("*");

    if (error) throw error;

    const emailMap = {};
    // ✅ FIX: antes borrábamos el duplicado sin reasignar sus dependencias.
    // Eso dejaba sesiones huérfanas (en_proceso apuntando a un picker borrado),
    // que rompían "ver detalles en vivo" con 404. Ahora reasignamos trash → master
    // (igual que mergePickers.js) ANTES de borrar.
    const reassign = []; // [{ trashId, masterId }]

    for (const picker of pickers) {
      const cleanEmail = (picker.email || "").toLowerCase().trim();

      if (!cleanEmail) continue;

      // Si el email actual tiene mayúsculas, lo normalizamos de una
      if (picker.email !== cleanEmail) {
        console.log(`Normalizando email: ${picker.email} -> ${cleanEmail}`);
        await supabase
          .from("wc_pickers")
          .update({ email: cleanEmail })
          .eq("id", picker.id);
      }

      if (!emailMap[cleanEmail]) {
        emailMap[cleanEmail] = picker;
      } else {
        // ¡ENCONTRAMOS UN DUPLICADO!
        console.log(`⚠️ Duplicado encontrado para: ${cleanEmail}`);
        const original = emailMap[cleanEmail];
        const duplicate = picker;

        // Decidir cuál borrar: Preferimos el que tenga sesión activa o el más viejo
        let master = original;
        let trash = duplicate;

        if (!original.id_sesion_actual && duplicate.id_sesion_actual) {
          master = duplicate;
          trash = original;
        }

        console.log(`🔗 Duplicado ${trash.id} → master ${master.id}`);
        reassign.push({ trashId: trash.id, masterId: master.id });
        emailMap[cleanEmail] = master; // El master queda como referencia
      }
    }

    // 2. Reasignar dependencias y borrar los duplicados
    if (reassign.length > 0) {
      console.log(`⏳ Reasignando y borrando ${reassign.length} duplicado(s)...`);
      for (const { trashId, masterId } of reassign) {
        // A. Mover asignaciones, sesiones y logs al master (no dejar huérfanos)
        await supabase
          .from("wc_asignaciones_pedidos")
          .update({ id_picker: masterId })
          .eq("id_picker", trashId);
        await supabase
          .from("wc_picking_sessions")
          .update({ id_picker: masterId })
          .eq("id_picker", trashId);
        try {
          await supabase
            .from("wc_log_picking")
            .update({ id_picker: masterId })
            .eq("id_picker", trashId);
        } catch (e) {
          // Ignorar si la columna no existe en wc_log_picking
        }

        // B. Recién ahora, sin dependencias colgando, borrar el duplicado
        const { error: delError } = await supabase
          .from("wc_pickers")
          .delete()
          .eq("id", trashId);
        if (delError) throw delError;
        console.log(`✅ ${trashId} reasignado a ${masterId} y eliminado.`);
      }
    } else {
      console.log("✨ No se encontraron duplicados para borrar.");
    }

    console.log("🚀 Limpieza completada. Villahermosa está impecable.");

  } catch (err) {
    console.error("❌ Error durante la limpieza:", err.message);
  }
}

cleanupPickers();
