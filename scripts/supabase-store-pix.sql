-- PIX: colunas em stores e orders (copiar para Supabase → SQL Editor)
-- Equivalente a supabase/migrations/20260518140000_store_order_pix.sql

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS pix_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pix_key_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS pix_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS pix_receiver_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS pix_receiver_city VARCHAR(255);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS pix_payload TEXT,
  ADD COLUMN IF NOT EXISTS pix_paid_at TIMESTAMPTZ;
