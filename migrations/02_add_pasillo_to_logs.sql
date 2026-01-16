-- Migration: Add Pasillo column to Picking Logs for Route Analysis
-- Ejecuta esto en Supabase SQL Editor

-- 1. Agregar columna de pasillo a los logs de picking
ALTER TABLE public.wc_log_picking 
ADD COLUMN IF NOT EXISTS pasillo VARCHAR(50) DEFAULT NULL;

-- 2. Agregar índice para optimizar queries de ruta
CREATE INDEX IF NOT EXISTS idx_wc_log_picking_pasillo 
ON public.wc_log_picking (pasillo);

-- 3. Comentario descriptivo
COMMENT ON COLUMN public.wc_log_picking.pasillo IS 'Pasillo del almacén donde se encontraba el producto. Usado para análisis de ruta del picker.';
