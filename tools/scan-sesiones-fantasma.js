/**
 * Escaneo SOLO LECTURA: detecta sesiones fantasma.
 * Una sesión es fantasma si está en_proceso pero:
 *   - su picker no existe, O
 *   - el picker existe pero su id_sesion_actual NO apunta a esta sesión.
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const path = require("path");
const { supabase } = require(
  path.join(__dirname, "..", "services", "supabaseClient.js"),
);

async function main() {
  const { data: sessions, error } = await supabase
    .from("wc_picking_sessions")
    .select("id, estado, id_picker, ids_pedidos, fecha_inicio")
    .eq("estado", "en_proceso");

  if (error) throw error;
  console.log(`📋 Sesiones en_proceso: ${(sessions || []).length}\n`);

  let fantasmas = 0;
  for (const s of sessions || []) {
    const { data: picker } = await supabase
      .from("wc_pickers")
      .select("id, id_sesion_actual, estado_picker")
      .eq("id", s.id_picker)
      .single();

    let motivo = null;
    if (!picker) motivo = "picker NO existe";
    else if (picker.id_sesion_actual !== s.id)
      motivo = `picker apunta a otra sesión (${picker.id_sesion_actual || "null"})`;

    if (motivo) {
      fantasmas++;
      // ¿tiene actividad?
      const { data: asigs } = await supabase
        .from("wc_asignaciones_pedidos")
        .select("id")
        .eq("id_sesion", s.id);
      const asigIds = (asigs || []).map((a) => a.id);
      let logCount = 0;
      if (asigIds.length > 0) {
        const { count } = await supabase
          .from("wc_log_picking")
          .select("id", { count: "exact", head: true })
          .in("id_asignacion", asigIds);
        logCount = count || 0;
      }
      console.log(`👻 ${s.id.slice(0, 8)} | pedidos ${JSON.stringify(s.ids_pedidos)} | ${motivo} | logs: ${logCount} | inicio: ${s.fecha_inicio}`);
    }
  }

  console.log(`\n${fantasmas === 0 ? "✅ No hay sesiones fantasma." : `⚠️ Total fantasmas: ${fantasmas}`}`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
