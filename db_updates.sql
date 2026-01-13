-- AGREGA ESTA COLUMNA para guardar la "foto" del reporte final
-- Esto permite que el historial cargue instantáneamente sin reconstruir logs
ALTER TABLE public.wc_asignaciones_pedidos
ADD COLUMN reporte_snapshot jsonb DEFAULT NULL;

-- (Opcional) Asegurar índices para búsquedas rápidas en logs si crecen mucho
CREATE INDEX IF NOT EXISTS idx_wc_log_id_pedido ON public.wc_log_recoleccion(id_pedido);
CREATE INDEX IF NOT EXISTS idx_wc_log_accion ON public.wc_log_recoleccion(accion);
