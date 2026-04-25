
const { supabase } = require("../services/supabaseClient");

async function cancelSession() {
  const shortId = "1c95ae"; // El ID que me pasaste
  console.log(`🔍 Buscando sesión que empiece con: ${shortId}...`);

  try {
    // 1. Encontrar el UUID completo
    const { data: sessions, error: sError } = await supabase
      .from("wc_picking_sessions")
      .select("id, id_picker, ids_pedidos")
      .order("fecha_inicio", { ascending: false })
      .limit(50);

    if (sError) throw sError;

    const session = sessions.find(s => s.id.startsWith(shortId));

    if (!session) {
      console.error("❌ No se encontró ninguna sesión con ese ID corto.");
      return;
    }

    const fullId = session.id;
    const idPicker = session.id_picker;
    console.log(`✅ Sesión encontrada: ${fullId}`);
    console.log(`👤 Picker asociado: ${idPicker}`);

    const now = new Date().toISOString();

    // 2. Cancelar la sesión
    console.log("⏳ Cancelando sesión...");
    const { error: sessErr } = await supabase
      .from("wc_picking_sessions")
      .update({ estado: 'cancelado', fecha_fin: now })
      .eq("id", fullId);
    if (sessErr) throw sessErr;

    // 3. Cancelar las asignaciones
    console.log("⏳ Cancelando asignaciones...");
    const { error: assignErr } = await supabase
      .from("wc_asignaciones_pedidos")
      .update({ estado_asignacion: 'cancelado', fecha_fin: now })
      .eq("id_sesion", fullId);
    if (assignErr) throw assignErr;

    // 4. Liberar al picker (Usando resolución flexible por las dudas)
    console.log("⏳ Liberando picker...");
    const { error: pickerErr } = await supabase
      .from("wc_pickers")
      .update({ estado_picker: 'disponible', id_sesion_actual: null })
      .or(`id.eq.${idPicker},id_sesion_actual.eq.${fullId}`);
    if (pickerErr) throw pickerErr;

    console.log("🚀 ¡TODO LISTO! Sesión cancelada, pedidos liberados y picker disponible.");

  } catch (err) {
    console.error("❌ Error durante la cancelación:", err.message);
  }
}

cancelSession();
