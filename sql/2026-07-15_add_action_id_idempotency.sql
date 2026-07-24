-- Idempotencia de acciones de picking.
-- Agrega action_id (UUID generado por el picker al encolar) para deduplicar
-- reenvíos de la cola offline SIN descartar unidades legítimas del mismo
-- producto. Reemplaza el debounce por ventana de 3s que subcontaba picks
-- unidad-por-unidad y dejaba items como "parcial" en el admin.
--
-- ⚠️ CORRER ESTA MIGRACIÓN ANTES de desplegar el backend nuevo:
-- el controller ya inserta/consulta action_id y sin la columna el picking falla.

alter table wc_log_picking
  add column if not exists action_id uuid;

-- Índice para la búsqueda de idempotencia (SELECT ... where action_id = ...).
-- No es UNIQUE: una acción con qty>1 inserta varias filas que comparten action_id.
create index if not exists idx_wc_log_picking_action_id
  on wc_log_picking (action_id);
