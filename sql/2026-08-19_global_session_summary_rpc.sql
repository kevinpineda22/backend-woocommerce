-- =====================================================================
-- RPC: total de recaudo ALL-TIME desde columnas pre-agregadas.
--
-- Reemplaza el escaneo de JSONB en vivo (snapshot_pedidos / datos_salida)
-- por un SUM/COUNT sobre columnas indexadas. Devuelve UNA fila jsonb:
--   { total_recaudado, total_pedidos, total_sesiones, por_metodo }
--
-- Depende de las columnas creadas en 2026-08-19_add_session_summary_cols
-- (total_recaudado, orders_count, resumen_por_metodo) y de su backfill.
--
-- Correr en el SQL editor de Supabase (idempotente).
-- =====================================================================

create or replace function get_global_session_summary(p_sede_id uuid default null)
returns jsonb
language sql
stable
as $$
  with base as (
    select total_recaudado, orders_count, resumen_por_metodo, sede_id
    from wc_picking_sessions
    where estado in ('finalizado', 'auditado', 'pendiente_auditoria')
      and (p_sede_id is null or sede_id = p_sede_id)
  ),
  metodos as (
    select m.key as metodo, sum((m.value)::numeric) as valor
    from base b,
         lateral jsonb_each_text(coalesce(b.resumen_por_metodo, '{}'::jsonb)) as m
    group by m.key
  ),
  sedes as (
    -- Cada sesión pertenece a UNA sede: el recaudo por sede es un GROUP BY simple.
    select coalesce(se.nombre, 'Sin sede') as nombre, sum(b.total_recaudado) as valor
    from base b
    left join wc_sedes se on se.id = b.sede_id
    group by coalesce(se.nombre, 'Sin sede')
  )
  select jsonb_build_object(
    'total_recaudado', coalesce((select sum(total_recaudado) from base), 0),
    'total_pedidos',   coalesce((select sum(orders_count) from base), 0),
    'total_sesiones',  (select count(*) from base),
    'por_metodo',      coalesce(
                         (select jsonb_object_agg(metodo, round(valor)) from metodos),
                         '{}'::jsonb
                       ),
    'por_sede',        coalesce(
                         (select jsonb_object_agg(nombre, round(valor)) from sedes),
                         '{}'::jsonb
                       )
  );
$$;
