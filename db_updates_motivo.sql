-- Agregar columna 'motivo' a la tabla de logs para guardar la razón del retiro
ALTER TABLE public.wc_log_recoleccion
ADD COLUMN motivo text NULL;
