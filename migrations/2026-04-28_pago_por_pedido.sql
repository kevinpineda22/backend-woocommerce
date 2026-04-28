-- ============================================================================
-- Migración: pago por pedido (no por sesión)
-- Fecha: 2026-04-28
-- Motivo: Cada pedido dentro de una sesión de picking puede pagarse con un
--         método distinto. El modelo previo guardaba un único metodo_pago
--         a nivel de wc_picking_sessions, lo que aplastaba esta diferencia.
-- ============================================================================

-- 1. Columnas nuevas en la tabla junction sesión↔pedido
ALTER TABLE wc_asignaciones_pedidos
  ADD COLUMN IF NOT EXISTS metodo_pago text
    CHECK (metodo_pago IN ('efectivo', 'qr', 'datafono', 'credito')),
  ADD COLUMN IF NOT EXISTS fecha_pago timestamptz,
  ADD COLUMN IF NOT EXISTS pagado_por text;

-- 2. Índice para acelerar la consulta de pendientes (sesiones con asignaciones
--    sin metodo_pago asignado).
CREATE INDEX IF NOT EXISTS idx_asignaciones_metodo_pago_pendiente
  ON wc_asignaciones_pedidos (id_sesion)
  WHERE metodo_pago IS NULL;

-- 3. Backfill: sesiones ya finalizadas con metodo_pago en wc_picking_sessions.
--    Replicamos ese valor a todas sus asignaciones para no perder histórico.
UPDATE wc_asignaciones_pedidos a
SET
  metodo_pago = s.metodo_pago,
  fecha_pago  = COALESCE(a.fecha_pago, s.fecha_pago),
  pagado_por  = COALESCE(a.pagado_por, s.pagado_por)
FROM wc_picking_sessions s
WHERE a.id_sesion = s.id
  AND a.metodo_pago IS NULL
  AND s.metodo_pago IS NOT NULL;

-- 4. Verificación post-migración (queries de chequeo, no destructivas).
--    Las dejamos comentadas para que el operador las corra a mano si quiere.
-- SELECT COUNT(*) FROM wc_asignaciones_pedidos WHERE metodo_pago IS NOT NULL;
-- SELECT id_sesion, COUNT(*) FILTER (WHERE metodo_pago IS NULL) AS pendientes
--   FROM wc_asignaciones_pedidos GROUP BY id_sesion HAVING COUNT(*) FILTER (WHERE metodo_pago IS NULL) > 0;
