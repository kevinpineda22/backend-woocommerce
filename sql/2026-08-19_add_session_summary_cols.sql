-- =====================================================================
-- Columnas de recaudo PRE-AGREGADO por sesión.
--
-- Motivo: el Centro de Inteligencia calculaba el total all-time escaneando
-- los JSONB snapshot_pedidos / datos_salida de TODAS las sesiones en cada
-- request. Con range=all eso saturaba Supabase (521 / schema cache) y tumbaba
-- el resto de endpoints. Estas columnas se llenan UNA vez por sesión
-- (en utils/sessionRevenue.refreshSessionSummary) y el total se lee con un
-- SUM indexado (ver 2026-08-19_global_session_summary_rpc.sql).
--
-- Correr en el SQL editor de Supabase (idempotente).
-- =====================================================================

alter table wc_picking_sessions
  add column if not exists total_recaudado    numeric,
  add column if not exists orders_count       integer,
  add column if not exists resumen_por_metodo jsonb;

-- Acelera el filtro del recaudo (estado + rango de fecha) y del backfill.
create index if not exists idx_wc_sessions_estado_fechafin
  on wc_picking_sessions (estado, fecha_fin);
