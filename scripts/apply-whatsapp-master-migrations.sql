-- =============================================================================
-- Vyria — WhatsApp Master (migrations 291000 base + 311300–312000)
-- =============================================================================
-- Cole no SQL Editor do Supabase e execute de uma vez.
-- Idempotente — seguro se já aplicou parte das migrations.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 20260729100000 — schema base (se ainda não existir)
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

CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  event_type text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_store_created
  ON public.whatsapp_webhook_events (store_id, created_at DESC);

DO $$
BEGIN
  ALTER TABLE public.store_whatsapp_config
    ADD CONSTRAINT store_whatsapp_config_status_chk
    CHECK (status IN ('pending', 'active', 'disconnected', 'error'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.store_whatsapp_config
    ADD CONSTRAINT store_whatsapp_config_ai_tone_chk
    CHECK (ai_tone IN ('casual', 'formal'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_direction_chk
    CHECK (direction IN ('inbound', 'outbound'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.store_whatsapp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_whatsapp_config_owner ON public.store_whatsapp_config;
CREATE POLICY store_whatsapp_config_owner
  ON public.store_whatsapp_config FOR ALL TO authenticated
  USING (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3))
  WITH CHECK (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3));

DROP POLICY IF EXISTS whatsapp_messages_owner_select ON public.whatsapp_messages;
CREATE POLICY whatsapp_messages_owner_select
  ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3));

DROP POLICY IF EXISTS whatsapp_webhook_events_owner_select ON public.whatsapp_webhook_events;
CREATE POLICY whatsapp_webhook_events_owner_select
  ON public.whatsapp_webhook_events FOR SELECT TO authenticated
  USING (
    store_id IS NULL
    OR (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3))
  );

REVOKE ALL ON public.store_whatsapp_config FROM anon;
REVOKE ALL ON public.whatsapp_messages FROM anon;
REVOKE ALL ON public.whatsapp_webhook_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_whatsapp_config TO authenticated;
GRANT SELECT ON public.whatsapp_messages TO authenticated;
GRANT SELECT ON public.whatsapp_webhook_events TO authenticated;

-- 20260731140000 — auto_reply_enabled (idempotente)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'store_whatsapp_config'
      AND column_name = 'ai_enabled'
  ) THEN
    ALTER TABLE public.store_whatsapp_config
      RENAME COLUMN ai_enabled TO auto_reply_enabled;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'store_whatsapp_config'
      AND column_name = 'auto_reply_enabled'
  ) THEN
    ALTER TABLE public.store_whatsapp_config
      ADD COLUMN auto_reply_enabled boolean NOT NULL DEFAULT true;
  END IF;
END $$;

COMMENT ON COLUMN public.store_whatsapp_config.auto_reply_enabled IS
  'Atendimento automático (menu interactivo + respostas por intenção).';

ALTER TABLE public.store_whatsapp_contacts
  ADD COLUMN IF NOT EXISTS conversation_status text NOT NULL DEFAULT 'auto';

DO $$
BEGIN
  ALTER TABLE public.store_whatsapp_contacts
    ADD CONSTRAINT store_whatsapp_contacts_conversation_status_chk
    CHECK (conversation_status IN ('auto', 'humano'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 20260731150000 — whatsapp_send_failures
CREATE TABLE IF NOT EXISTS public.whatsapp_send_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_phone text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  flow text NOT NULL,
  error_code integer,
  error_message text NOT NULL,
  is_window_expired boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_send_failures_store_created
  ON public.whatsapp_send_failures (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_send_failures_store_window
  ON public.whatsapp_send_failures (store_id, is_window_expired, created_at DESC);

DO $$
BEGIN
  ALTER TABLE public.whatsapp_send_failures
    ADD CONSTRAINT whatsapp_send_failures_message_type_chk
    CHECK (message_type IN ('text', 'image', 'interactive'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.whatsapp_send_failures
    ADD CONSTRAINT whatsapp_send_failures_flow_chk
    CHECK (
      flow IN (
        'order_notification',
        'loyalty',
        'robot',
        'marketing',
        'test'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.whatsapp_send_failures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_send_failures_owner_select ON public.whatsapp_send_failures;
CREATE POLICY whatsapp_send_failures_owner_select
  ON public.whatsapp_send_failures FOR SELECT TO authenticated
  USING (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3));
REVOKE ALL ON public.whatsapp_send_failures FROM anon;
GRANT SELECT ON public.whatsapp_send_failures TO authenticated;

-- 20260731160000 — store_whatsapp_templates
CREATE TABLE IF NOT EXISTS public.store_whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  template_name text NOT NULL,
  category text NOT NULL,
  language text NOT NULL DEFAULT 'pt_BR',
  status text NOT NULL DEFAULT 'pending',
  meta_template_id text,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, template_name)
);

CREATE INDEX IF NOT EXISTS idx_store_whatsapp_templates_store
  ON public.store_whatsapp_templates (store_id, template_name);

CREATE INDEX IF NOT EXISTS idx_store_whatsapp_config_phone_number_id
  ON public.store_whatsapp_config (phone_number_id)
  WHERE phone_number_id IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_store_whatsapp_config_waba_id
  ON public.store_whatsapp_config (waba_id)
  WHERE waba_id IS NOT NULL AND status = 'active';

DO $$
BEGIN
  ALTER TABLE public.store_whatsapp_templates
    ADD CONSTRAINT store_whatsapp_templates_category_chk
    CHECK (category IN ('utility', 'marketing'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.store_whatsapp_templates
    ADD CONSTRAINT store_whatsapp_templates_status_chk
    CHECK (status IN ('pending', 'approved', 'rejected'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.store_whatsapp_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_whatsapp_templates_owner_select ON public.store_whatsapp_templates;
CREATE POLICY store_whatsapp_templates_owner_select
  ON public.store_whatsapp_templates FOR SELECT TO authenticated
  USING (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3));
REVOKE ALL ON public.store_whatsapp_templates FROM anon;
GRANT SELECT ON public.store_whatsapp_templates TO authenticated;

-- 20260731200000 — onboarding manual
ALTER TABLE public.store_whatsapp_config
  ADD COLUMN IF NOT EXISTS onboarding_contact_phone text,
  ADD COLUMN IF NOT EXISTS onboarding_notes text,
  ADD COLUMN IF NOT EXISTS onboarding_requested_at timestamptz;

SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

-- Verificação (opcional):
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--   AND table_name IN (
--     'store_whatsapp_config', 'whatsapp_messages', 'whatsapp_webhook_events',
--     'whatsapp_send_failures', 'store_whatsapp_templates'
--   );
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'store_whatsapp_config'
--   AND column_name IN ('auto_reply_enabled', 'onboarding_contact_phone');
