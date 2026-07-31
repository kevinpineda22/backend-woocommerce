-- Trazabilidad de traslados de pedidos entre sedes (feature traslado-pedido-sede).
-- Cada traslado clona el pedido en la sede destino (precios de ORIGEN) y opcionalmente
-- cancela el origen; esta tabla guarda el par origen/destino para auditoría y rollback.
--
-- El UNIQUE (order_id_origen, sede_origen_id) da idempotencia: el backend responde 409
-- si ya existe un traslado para ese par (guard ya-trasladado).
--
-- ⚠️ CORRER ESTE DDL VÍA SQL EDITOR DE SUPABASE ANTES de desplegar el backend con
-- los endpoints /trasladar-pedido: el controller inserta/consulta esta tabla.
--
-- Sin FK a wc_sedes por consistencia con wc_pedidos_cancelados (sede_id uuid simple).

create table if not exists wc_pedidos_trasladados (
  id uuid primary key default gen_random_uuid(),
  order_id_origen bigint not null,
  sede_origen_id uuid not null,
  order_id_destino bigint not null,
  sede_destino_id uuid not null,
  estado text not null default 'completado'
    check (estado in ('completado','pendiente_cancelar')),
  warnings jsonb not null default '[]'::jsonb,
  admin_name text not null,
  admin_email text,
  motivo text,
  created_at timestamptz not null default now(),
  unique (order_id_origen, sede_origen_id)
);

-- Índice para listar traslados por sede destino (panel de trazabilidad/rollback).
create index if not exists idx_trasladados_destino
  on wc_pedidos_trasladados (sede_destino_id, created_at desc);

-- RLS: deshabilitado por defecto (patrón del proyecto: wc_pedidos_cancelados,
-- wc_audit_log, etc.). El único acceso es el backend con service role key, que
-- bypasea RLS. Habilitar + policies solo si en el futuro el frontend la consulta
-- directo con la anon key.
