// Buscar la sesion de picking del pedido #77668 y su datos_salida
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ORDER_ID = "77668";

async function main() {
  const { data: sessions, error } = await supabase
    .from("wc_picking_sessions")
    .select("id, fecha_fin, estado, ids_pedidos, datos_salida, snapshot_pedidos")
    .contains("ids_pedidos", [ORDER_ID])
    .order("fecha_inicio", { ascending: false });

  if (error) {
    console.error("Error:", error);
    process.exit(1);
  }

  console.log(`Sesiones encontradas: ${sessions.length}`);
  sessions.forEach((s) => {
    console.log(`\n--- Session ${s.id} ---`);
    console.log("Estado:", s.estado);
    console.log("Fecha fin:", s.fecha_fin);
    console.log("ids_pedidos:", s.ids_pedidos);
    console.log("datos_salida existe?", !!s.datos_salida);
  });

  if (sessions.length === 0) {
    // Intentar como numero por si esta como int
    const { data: s2 } = await supabase
      .from("wc_picking_sessions")
      .select("id, fecha_fin, estado, ids_pedidos, datos_salida")
      .contains("ids_pedidos", [Number(ORDER_ID)])
      .order("fecha_inicio", { ascending: false });
    console.log("Fallback numero:", s2?.length || 0);
    if (s2?.length) s2.forEach((s) => console.log(s.id, s.estado, s.ids_pedidos));
  }

  // Guardar la mas reciente con datos_salida
  const withData = sessions.find((s) => s.datos_salida);
  if (withData) {
    require("fs").writeFileSync(
      "tools/_debug_session_77668_datos_salida.json",
      JSON.stringify(withData.datos_salida, null, 2),
    );
    require("fs").writeFileSync(
      "tools/_debug_session_77668_snapshot.json",
      JSON.stringify(withData.snapshot_pedidos, null, 2),
    );
    console.log("\nGuardado en tools/_debug_session_77668_datos_salida.json");
    console.log("Session ID:", withData.id);
  } else {
    console.log("\nNinguna sesion tiene datos_salida aun.");
  }
}

main();
