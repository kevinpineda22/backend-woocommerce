-- Migration: Add Precision Timestamps for Analytics 2.0
-- Run this in your Supabase SQL Editor

-- 1. Add device_timestamp to Log Picking
-- This stores exactly when the user swiped/scanned the item on their device
ALTER TABLE public.wc_log_picking 
ADD COLUMN IF NOT EXISTS device_timestamp TIMESTAMPTZ DEFAULT NOW();

-- 2. Add started_at_device to Assignments
-- This stores exactly when the picker opened the order/started walking
ALTER TABLE public.wc_asignaciones_pedidos 
ADD COLUMN IF NOT EXISTS started_at_device TIMESTAMPTZ;

-- 3. Add Index for simpler querying on timestamps
CREATE INDEX IF NOT EXISTS idx_wc_log_picking_device_ts 
ON public.wc_log_picking (device_timestamp);
