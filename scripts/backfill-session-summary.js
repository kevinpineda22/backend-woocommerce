// Backfill del recaudo pre-agregado por sesión.
//
// Rellena total_recaudado / orders_count / resumen_por_metodo en TODAS las
// sesiones existentes usando computeSessionRevenue (la MISMA lógica que el
// endpoint de detalle y el hook en vivo). Es idempotente y re-ejecutable:
// recalcula desde cero cada vez, así que sirve también como "sana el histórico"
// si alguna vez el pre-agregado se desincronizara.
//
// Uso: node scripts/backfill-session-summary.js
//
// Requiere SUPABASE_URL y SUPABASE_KEY (service role) en el .env — igual que el
// backend. Corre contra la MISMA base que apunte tu .env: apuntá a producción
// solo cuando quieras rellenar producción.

require("dotenv").config();
const { supabase } = require("../services/supabaseClient");
const {
  computeSessionRevenue,
  REVENUE_STATES,
} = require("../utils/sessionRevenue");

const PAGE = 500;

async function main() {
  const started = Date.now();
  let from = 0;
  let processed = 0;
  let updated = 0;
  let failed = 0;
  let totalAcum = 0;

  console.log("→ Backfill de recaudo pre-agregado. Estados:", REVENUE_STATES.join(", "));

  for (;;) {
    const { data: sessions, error } = await supabase
      .from("wc_picking_sessions")
      .select(
        "id, estado, metodo_pago, snapshot_pedidos, datos_salida, ids_pedidos, wc_asignaciones_pedidos(id_pedido, metodo_pago, fecha_pago, pagado_por)",
      )
      .in("estado", REVENUE_STATES)
      .order("fecha_fin", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) throw error;
    if (!sessions || sessions.length === 0) break;

    console.log(`  → página traída: ${sessions.length} sesiones, actualizando...`);

    for (const s of sessions) {
      const summary = computeSessionRevenue(s);
      const { error: updErr } = await supabase
        .from("wc_picking_sessions")
        .update(summary)
        .eq("id", s.id);

      if (updErr) {
        failed += 1;
        console.error(`  ✗ ${s.id}: ${updErr.message}`);
      } else {
        updated += 1;
        totalAcum += summary.total_recaudado;
      }
      processed += 1;
      if (processed % 50 === 0) {
        process.stdout.write(`\r  ... ${processed} sesiones procesadas`);
      }
    }

    console.log(`\r  ... ${processed} sesiones procesadas (página completa)`);
    if (sessions.length < PAGE) break;
    from += PAGE;
  }

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\n✅ Backfill completo: ${updated} OK / ${failed} fallidas / ${processed} totales en ${secs}s`,
  );
  console.log(
    `   Recaudo acumulado (control): $${totalAcum.toLocaleString("es-CO")}`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("❌ Backfill falló:", err);
  process.exit(1);
});
