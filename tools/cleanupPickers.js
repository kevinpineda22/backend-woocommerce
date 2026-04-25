
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
    const toDelete = [];

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

        console.log(`🗑️ Marcando para borrar ID duplicado: ${trash.id}`);
        toDelete.push(trash.id);
        emailMap[cleanEmail] = master; // El master queda como referencia
      }
    }

    // 2. Borrar los duplicados
    if (toDelete.length > 0) {
      console.log(`⏳ Borrando ${toDelete.length} registros duplicados...`);
      const { error: delError } = await supabase
        .from("wc_pickers")
        .delete()
        .in("id", toDelete);
      
      if (delError) throw delError;
      console.log("✅ Duplicados eliminados satisfactoriamente.");
    } else {
      console.log("✨ No se encontraron duplicados para borrar.");
    }

    console.log("🚀 Limpieza completada. Villahermosa está impecable.");

  } catch (err) {
    console.error("❌ Error durante la limpieza:", err.message);
  }
}

cleanupPickers();
