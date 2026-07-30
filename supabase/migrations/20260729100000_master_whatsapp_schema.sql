-- Plano Master: WhatsApp Cloud API (fase 0 — fundação).
-- Idempotente — aplicar no SQL Editor do Supabase se migrations locais não correrem.

-- ---------------------------------------------------------------------------
-- Tier comercial: Master = 3 (acima de Pro = 2)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_plan_tier(p_store_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(nullif(s.plano::text, ''), nullif(s.plan::text, ''), 'start'))) = 'master' THEN 3
    WHEN lower(trim(coalesce(nullif(s.plano::text, ''), nullif(s.plan::text, ''), 'start'))) = 'pro' THEN 2
    WHEN lower(trim(coalesce(nullif(s.plano::text, ''), nullif(s.plan::text, ''), 'start'))) IN ('growth') THEN 1
    ELSE 0
  END
  FROM public.stores s
  WHERE s.id = p_store_id
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- store_whatsapp_config — credenciais WABA por loja (token encriptado no app)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_whatsapp_config (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  waba_id text,
  phone_number_id text,
  display_phone_e164 text,
  access_token_enc text,
  webhook_verified_at timestamptz,
  ai_enabled boolean NOT NULL DEFAULT true,
  ai_tone text NOT NULL DEFAULT 'casual',
  notify_order_received boolean NOT NULL DEFAULT false,
  notify_order_preparing boolean NOT NULL DEFAULT false,
  notify_order_ready boolean NOT NULL DEFAULT false,
  notify_order_delivered boolean NOT NULL DEFAULT false,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.store_whatsapp_config IS
  'Configuração WhatsApp Cloud API por loja (plano Master).';

DO $$
BEGIN
  ALTER TABLE public.store_whatsapp_config
    ADD CONSTRAINT store_whatsapp_config_status_chk
    CHECK (status IN ('pending', 'active', 'disconnected', 'error'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.store_whatsapp_config
    ADD CONSTRAINT store_whatsapp_config_ai_tone_chk
    CHECK (ai_tone IN ('casual', 'formal'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- whatsapp_messages — log inbound/outbound
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  direction text NOT NULL,
  wa_message_id text,
  wa_from text,
  wa_to text,
  message_type text NOT NULL DEFAULT 'text',
  body_text text,
  payload jsonb,
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_store_created
  ON public.whatsapp_messages (store_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_store_wa_id
  ON public.whatsapp_messages (store_id, wa_message_id)
  WHERE wa_message_id IS NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_direction_chk
    CHECK (direction IN ('inbound', 'outbound'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- whatsapp_webhook_events — debug / auditoria de payloads Meta
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  event_type text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_store_created
  ON public.whatsapp_webhook_events (store_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS — tier Master (3) + dono da loja
-- ---------------------------------------------------------------------------
ALTER TABLE public.store_whatsapp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_whatsapp_config_owner ON public.store_whatsapp_config;
CREATE POLICY store_whatsapp_config_owner
  ON public.store_whatsapp_config
  FOR ALL
  TO authenticated
  USING (
    public.auth_owns_store(store_id)
    AND public.store_plan_tier_at_least(store_id, 3)
  )
  WITH CHECK (
    public.auth_owns_store(store_id)
    AND public.store_plan_tier_at_least(store_id, 3)
  );

DROP POLICY IF EXISTS whatsapp_messages_owner_select ON public.whatsapp_messages;
CREATE POLICY whatsapp_messages_owner_select
  ON public.whatsapp_messages
  FOR SELECT
  TO authenticated
  USING (
    public.auth_owns_store(store_id)
    AND public.store_plan_tier_at_least(store_id, 3)
  );

DROP POLICY IF EXISTS whatsapp_webhook_events_owner_select ON public.whatsapp_webhook_events;
CREATE POLICY whatsapp_webhook_events_owner_select
  ON public.whatsapp_webhook_events
  FOR SELECT
  TO authenticated
  USING (
    store_id IS NULL
    OR (
      public.auth_owns_store(store_id)
      AND public.store_plan_tier_at_least(store_id, 3)
    )
  );

REVOKE ALL ON public.store_whatsapp_config FROM anon;
REVOKE ALL ON public.whatsapp_messages FROM anon;
REVOKE ALL ON public.whatsapp_webhook_events FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_whatsapp_config TO authenticated;
GRANT SELECT ON public.whatsapp_messages TO authenticated;
GRANT SELECT ON public.whatsapp_webhook_events TO authenticated;
