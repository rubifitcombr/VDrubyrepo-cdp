-- Plano Master: fidelidade + recuperador de clientes.

-- ---------------------------------------------------------------------------
-- store_loyalty_config
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_loyalty_config (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  points_per_real numeric(8, 2) NOT NULL DEFAULT 1,
  min_redeem_points integer NOT NULL DEFAULT 100,
  redeem_cents_per_point integer NOT NULL DEFAULT 1,
  welcome_bonus_points integer NOT NULL DEFAULT 0,
  whatsapp_balance_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.store_loyalty_config IS
  'Programa de fidelidade por loja (plano Master).';

DO $$
BEGIN
  ALTER TABLE public.store_loyalty_config
    ADD CONSTRAINT store_loyalty_config_points_per_real_chk
    CHECK (points_per_real >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.store_loyalty_config
    ADD CONSTRAINT store_loyalty_config_min_redeem_chk
    CHECK (min_redeem_points >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- loyalty_accounts — saldo por cliente (telefone)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_phone text NOT NULL,
  customer_name text,
  points_balance integer NOT NULL DEFAULT 0,
  lifetime_earned integer NOT NULL DEFAULT 0,
  lifetime_redeemed integer NOT NULL DEFAULT 0,
  last_order_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, customer_phone)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_store_balance
  ON public.loyalty_accounts (store_id, points_balance DESC);

-- ---------------------------------------------------------------------------
-- loyalty_ledger — movimentos de pontos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_phone text NOT NULL,
  kind text NOT NULL,
  points_delta integer NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_store_created
  ON public.loyalty_ledger (store_id, created_at DESC);

DO $$
BEGIN
  ALTER TABLE public.loyalty_ledger
    ADD CONSTRAINT loyalty_ledger_kind_chk
    CHECK (kind IN ('earn', 'redeem', 'adjust', 'welcome'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- store_recovery_config
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_recovery_config (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  default_inactive_days integer NOT NULL DEFAULT 30,
  default_message_template text NOT NULL DEFAULT 'Olá {{nome}}! Sentimos a sua falta na {{loja}}. Que tal pedir de novo? {{link}}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.store_recovery_config
    ADD CONSTRAINT store_recovery_config_inactive_days_chk
    CHECK (default_inactive_days >= 7 AND default_inactive_days <= 365);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- recovery_campaigns
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
-- RLS — tier Master (3) + dono da loja
-- ---------------------------------------------------------------------------
ALTER TABLE public.store_loyalty_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_recovery_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_loyalty_config_owner ON public.store_loyalty_config;
CREATE POLICY store_loyalty_config_owner
  ON public.store_loyalty_config FOR ALL TO authenticated
  USING (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3))
  WITH CHECK (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3));

DROP POLICY IF EXISTS loyalty_accounts_owner ON public.loyalty_accounts;
CREATE POLICY loyalty_accounts_owner
  ON public.loyalty_accounts FOR ALL TO authenticated
  USING (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3))
  WITH CHECK (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3));

DROP POLICY IF EXISTS loyalty_ledger_owner ON public.loyalty_ledger;
CREATE POLICY loyalty_ledger_owner
  ON public.loyalty_ledger FOR ALL TO authenticated
  USING (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3))
  WITH CHECK (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 3));

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

REVOKE ALL ON public.store_loyalty_config FROM anon;
REVOKE ALL ON public.loyalty_accounts FROM anon;
REVOKE ALL ON public.loyalty_ledger FROM anon;
REVOKE ALL ON public.store_recovery_config FROM anon;
REVOKE ALL ON public.recovery_campaigns FROM anon;
REVOKE ALL ON public.recovery_sends FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_loyalty_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_ledger TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_recovery_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_sends TO authenticated;
