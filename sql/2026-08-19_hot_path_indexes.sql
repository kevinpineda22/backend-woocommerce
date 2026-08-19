-- =====================================================================
-- Índices de los caminos calientes del módulo ecommerce.
--
-- Postgres NO indexa las columnas FK automáticamente. Sin estos índices,
-- cada join / .in() de los endpoints del dashboard (que se llaman cada 30s
-- y en cada evento realtime) hace SEQ SCAN de la tabla completa. Con picking
-- activo eso es un costo brutal e invisible.
--
-- NOTA: el SQL Editor de Supabase corre todo dentro de una transacción, por eso
-- NO se puede usar CREATE INDEX CONCURRENTLY acá (da ERROR 25001). Se usa
-- CREATE INDEX normal, que BLOQUEA las escrituras de la tabla mientras construye.
-- A la escala actual (miles/decenas de miles de filas) eso son segundos o menos:
-- correr en un momento de POCA actividad (no en pico de picking).
--
-- Se puede pegar todo el bloque de una: son transaccionales y idempotentes.
-- =====================================================================

-- Ver qué índices YA existen antes de crear (diagnóstico, no modifica nada):
--   select tablename, indexname, indexdef
--   from pg_indexes
--   where tablename in ('wc_picking_sessions','wc_asignaciones_pedidos','wc_log_picking')
--   order by tablename, indexname;

-- LOGS: se filtran por id_asignacion en TODOS los reportes. El más crítico.
-- (wc_log_picking NO tiene id_sesion: los logs se enlazan a la sesión vía la
-- asignación, así que solo se indexa id_asignacion.)
create index if not exists idx_wc_log_asignacion
  on wc_log_picking (id_asignacion);

-- ASIGNACIONES: junction sesión↔pedido, se join-ea por id_sesion en todos lados.
create index if not exists idx_wc_asig_sesion
  on wc_asignaciones_pedidos (id_sesion);

-- Cartera: metodo_pago='credito' AND fecha_pago IS NULL. Índice parcial.
create index if not exists idx_wc_asig_cartera
  on wc_asignaciones_pedidos (fecha_fin)
  where metodo_pago = 'credito' and fecha_pago is null;

-- Rutas / inteligencia: estado_asignacion='completado' ordenado por fecha_fin.
create index if not exists idx_wc_asig_estado_fechafin
  on wc_asignaciones_pedidos (estado_asignacion, fecha_fin desc);

-- Filtro multi-sede recurrente.
create index if not exists idx_wc_asig_sede
  on wc_asignaciones_pedidos (sede_id);

-- SESIONES: estado (en_proceso / finalizado / auditado / pendiente_*).
-- (idx_wc_sessions_estado_fechafin ya se creó en la migración del pre-agregado.)
create index if not exists idx_wc_sessions_sede
  on wc_picking_sessions (sede_id);
