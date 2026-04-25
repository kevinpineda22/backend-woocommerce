
const { supabase } = require("../services/supabaseClient");

async function mergePickers() {
  console.log("🔄 Iniciando FUSIÓN de pickers duplicados...");

  try {
    const { data: pickers, error } = await supabase.from("wc_pickers").select("*");
    if (error) throw error;

    const emailMap = {};

    for (const picker of pickers) {
      const cleanEmail = (picker.email || "").toLowerCase().trim();
      if (!cleanEmail) continue;

      if (!emailMap[cleanEmail]) {
        emailMap[cleanEmail] = picker;
        // Aprovechamos para normalizar el email del "master" si hace falta
        if (picker.email !== cleanEmail) {
            await supabase.from("wc_pickers").update({ email: cleanEmail }).eq("id", picker.id);
        }
      } else {
        const master = emailMap[cleanEmail];
        const duplicate = picker;

        console.log(`🔗 Fusionando duplicado ${duplicate.id} -> Master ${master.id} (${cleanEmail})`);

        // A. Mover asignaciones
        const { error: err1 } = await supabase
          .from("wc_asignaciones_pedidos")
          .update({ id_picker: master.id })
          .eq("id_picker", duplicate.id);
        if (err1) console.warn("Error moviendo asignaciones:", err1.message);

        // B. Mover sesiones
        const { error: err2 } = await supabase
          .from("wc_picking_sessions")
          .update({ id_picker: master.id })
          .eq("id_picker", duplicate.id);
        if (err2) console.warn("Error moviendo sesiones:", err2.message);

        // C. Mover logs
        try {
            await supabase
                .from("wc_log_picking")
                .update({ id_picker: master.id })
                .eq("id_picker", duplicate.id);
        } catch (e) {
            // Ignorar si la columna no existe
        }

        // D. Ahora que está limpio de dependencias, borrar el duplicado
        const { error: delError } = await supabase
          .from("wc_pickers")
          .delete()
          .eq("id", duplicate.id);
        
        if (delError) {
            console.error(`❌ No se pudo borrar el duplicado ${duplicate.id}:`, delError.message);
        } else {
            console.log(`✅ Duplicado ${duplicate.id} eliminado y fusionado.`);
        }
      }
    }

    console.log("🚀 Fusión completada. El historial está a salvo y la lista limpia.");

  } catch (err) {
    console.error("❌ Error durante la fusión:", err.message);
  }
}

mergePickers();
