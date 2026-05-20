-- Cooldown resposta automática WhatsApp (copiar para Supabase → SQL Editor)
-- Equivalente a supabase/migrations/20260520120000_whatsapp_auto_reply_cooldown.sql

CREATE TABLE IF NOT EXISTS public.whatsapp_auto_reply_cooldowns (
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  phone VARCHAR(32) NOT NULL,
  last_replied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (store_id, phone)
);

CREATE INDEX IF NOT EXISTS whatsapp_auto_reply_cooldowns_last_replied_idx
  ON public.whatsapp_auto_reply_cooldowns (store_id, last_replied_at DESC);
