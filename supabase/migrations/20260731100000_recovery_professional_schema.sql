-- Recuperador profissional: CRM WhatsApp + oferta/promo + envio automático.
-- Idempotente: cria tabelas base do recuperador se ainda não existirem.

-- ---------------------------------------------------------------------------
-- store_recovery_config (base + colunas profissionais)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_recovery_config (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  default_inactive_days integer NOT NULL DEFAULT 30,
  default_message_template text NOT NULL DEFAULT 'Olá {{nome}}! Sentimos a sua falta na {{loja}} — faz {{dias}} dias que você não pede.

{{oferta}}

Peça aqui: {{link}}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_recovery_config
  ADD COLUMN IF NOT EXISTS promotion_id uuid;

ALTER TABLE public.store_recovery_config
  ADD COLUMN IF NOT EXISTS offer_title text;

ALTER TABLE public.store_recovery_config
  ADD COLUMN IF NOT EXISTS offer_description text;

ALTER TABLE public.store_recovery_config
  ADD COLUMN IF NOT EXISTS auto_send_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.store_recovery_config
  ADD COLUMN IF NOT EXISTS cooldown_days integer NOT NULL DEFAULT 7;

ALTER TABLE public.store_recovery_config
  ADD COLUMN IF NOT EXISTS max_sends_per_run integer NOT NULL DEFAULT 50;

ALTER TABLE public.store_recovery_config
  ADD COLUMN IF NOT EXISTS last_auto_run_at timestamptz;

DO $$
BEGIN
  ALTER TABLE public.store_recovery_config
    ADD CONSTRAINT store_recovery_config_inactive_days_chk
    CHECK (default_inactive_days >= 7 AND default_inactive_days <= 365);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.store_recovery_config
    ADD CONSTRAINT store_recovery_config_cooldown_chk
    CHECK (cooldown_days >= 1 AND cooldown_days <= 90);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.store_recovery_config
    ADD CONSTRAINT store_recovery_config_max_sends_chk
    CHECK (max_sends_per_run >= 1 AND max_sends_per_run <= 200);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- recovery_campaigns (base + colunas profissionais)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recovery_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  message_template text NOT NULL,
  inactive_days integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'draft',
  sent_count integer NOT NULL DEFAULT 0,
  converted_count integer NOT NULL DEFAULT 0,
  revenue_cents bigint NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recovery_campaigns_store_created
  ON public.recovery_campaigns (store_id, created_at DESC);

ALTER TABLE public.recovery_campaigns
  ADD COLUMN IF NOT EXISTS promotion_id uuid;

ALTER TABLE public.recovery_campaigns
  ADD COLUMN IF NOT EXISTS offer_title text;

ALTER TABLE public.recovery_campaigns
  ADD COLUMN IF NOT EXISTS offer_description text;

ALTER TABLE public.recovery_campaigns
  ADD COLUMN IF NOT EXISTS is_automatic boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  ALTER TABLE public.recovery_campaigns
    ADD CONSTRAINT recovery_campaigns_status_chk
    CHECK (status IN ('draft', 'sending', 'completed', 'paused'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.recovery_campaigns
    ADD CONSTRAINT recovery_campaigns_inactive_days_chk
    CHECK (inactive_days >= 7 AND inactive_days <= 365);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- recovery_sends — envios e conversões
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recovery_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.recovery_campaigns(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_phone text NOT NULL,
  customer_name text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  converted_at timestamptz,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  order_total_cents integer,
  wa_message_id text,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_recovery_sends_campaign
  ON public.recovery_sends (campaign_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_recovery_sends_store_phone
  ON public.recovery_sends (store_id, customer_phone);

-- ---------------------------------------------------------------------------
-- store_whatsapp_contacts — registo de quem fala com a loja no WhatsApp
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_whatsapp_contacts (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_phone text NOT NULL,
  customer_name text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_order_at timestamptz,
  marketing_opt_out boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'whatsapp',
  inbound_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, customer_phone)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_store_last_inbound
  ON public.store_whatsapp_contacts (store_id, last_inbound_at DESC NULLS LAST);

COMMENT ON TABLE public.store_whatsapp_contacts IS
  'Contactos WhatsApp por loja (nome, telefone, datas de entrada e última mensagem).';

-- ---------------------------------------------------------------------------
-- RLS — recuperador + contactos WhatsApp (Master tier 3)
-- ---------------------------------------------------------------------------
ALTER TABLE public.store_recovery_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_whatsapp_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_recovery_config_owner ON public.store_recovery_config;
CREATE POLICY store_recovery_config_owner
  ON public.store_recovery_config FOR ALL TO authenticated
  USING (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3))
  WITH CHECK (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3));

DROP POLICY IF EXISTS recovery_campaigns_owner ON public.recovery_campaigns;
CREATE POLICY recovery_campaigns_owner
  ON public.recovery_campaigns FOR ALL TO authenticated
  USING (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3))
  WITH CHECK (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3));

DROP POLICY IF EXISTS recovery_sends_owner ON public.recovery_sends;
CREATE POLICY recovery_sends_owner
  ON public.recovery_sends FOR ALL TO authenticated
  USING (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3))
  WITH CHECK (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3));

DROP POLICY IF EXISTS store_whatsapp_contacts_owner ON public.store_whatsapp_contacts;
CREATE POLICY store_whatsapp_contacts_owner
  ON public.store_whatsapp_contacts FOR ALL TO authenticated
  USING (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3))
  WITH CHECK (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3));

REVOKE ALL ON public.store_recovery_config FROM anon;
REVOKE ALL ON public.recovery_campaigns FROM anon;
REVOKE ALL ON public.recovery_sends FROM anon;
REVOKE ALL ON public.store_whatsapp_contacts FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_recovery_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_sends TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_whatsapp_contacts TO authenticated;
