-- Cooldown da resposta automática WhatsApp (link do cardápio): 1x por número a cada 3h por loja.

CREATE TABLE IF NOT EXISTS public.whatsapp_auto_reply_cooldowns (
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  phone VARCHAR(32) NOT NULL,
  last_replied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (store_id, phone)
);

CREATE INDEX IF NOT EXISTS whatsapp_auto_reply_cooldowns_last_replied_idx
  ON public.whatsapp_auto_reply_cooldowns (store_id, last_replied_at DESC);

COMMENT ON TABLE public.whatsapp_auto_reply_cooldowns IS
  'Última resposta automática (link) enviada por loja + telefone do cliente.';
COMMENT ON COLUMN public.whatsapp_auto_reply_cooldowns.last_replied_at IS
  'Momento do último envio da mensagem automática com {link}.';
