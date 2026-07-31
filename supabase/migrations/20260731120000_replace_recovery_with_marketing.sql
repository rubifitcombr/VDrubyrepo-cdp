-- Substitui recuperador por marketing WhatsApp (campanhas agendadas texto + imagem).

-- ---------------------------------------------------------------------------
-- Remover recuperador
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.recovery_sends CASCADE;
DROP TABLE IF EXISTS public.recovery_campaigns CASCADE;
DROP TABLE IF EXISTS public.store_recovery_config CASCADE;

-- ---------------------------------------------------------------------------
-- store_marketing_config
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_marketing_config (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  max_recipients_per_campaign integer NOT NULL DEFAULT 50,
  cooldown_days integer NOT NULL DEFAULT 7,
  max_campaigns_per_month integer NOT NULL DEFAULT 12,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.store_marketing_config
    ADD CONSTRAINT store_marketing_config_recipients_chk
    CHECK (max_recipients_per_campaign >= 1 AND max_recipients_per_campaign <= 50);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.store_marketing_config
    ADD CONSTRAINT store_marketing_config_cooldown_chk
    CHECK (cooldown_days >= 1 AND cooldown_days <= 30);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- marketing_campaigns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  body_text text NOT NULL,
  image_url text NOT NULL,
  audience text NOT NULL DEFAULT 'all_contacts',
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_store_scheduled
  ON public.marketing_campaigns (store_id, scheduled_at ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_store_created
  ON public.marketing_campaigns (store_id, created_at DESC);

DO $$
BEGIN
  ALTER TABLE public.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_status_chk
    CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'cancelled', 'failed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_audience_chk
    CHECK (audience IN ('all_contacts'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- marketing_sends
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_phone text NOT NULL,
  customer_name text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  wa_message_id text,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_marketing_sends_campaign
  ON public.marketing_sends (campaign_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_sends_store_phone
  ON public.marketing_sends (store_id, customer_phone, sent_at DESC);

-- ---------------------------------------------------------------------------
-- RLS — marketing (Master tier 3)
-- ---------------------------------------------------------------------------
ALTER TABLE public.store_marketing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_marketing_config_owner ON public.store_marketing_config;
CREATE POLICY store_marketing_config_owner
  ON public.store_marketing_config FOR ALL TO authenticated
  USING (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3))
  WITH CHECK (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3));

DROP POLICY IF EXISTS marketing_campaigns_owner ON public.marketing_campaigns;
CREATE POLICY marketing_campaigns_owner
  ON public.marketing_campaigns FOR ALL TO authenticated
  USING (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3))
  WITH CHECK (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3));

DROP POLICY IF EXISTS marketing_sends_owner ON public.marketing_sends;
CREATE POLICY marketing_sends_owner
  ON public.marketing_sends FOR ALL TO authenticated
  USING (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3))
  WITH CHECK (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3));

REVOKE ALL ON public.store_marketing_config FROM anon;
REVOKE ALL ON public.marketing_campaigns FROM anon;
REVOKE ALL ON public.marketing_sends FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_marketing_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_sends TO authenticated;
