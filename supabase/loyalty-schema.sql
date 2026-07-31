-- Fidelidade (plano Master) — executar no Supabase SQL Editor.
-- Inclui tabelas + RLS. Ver também: supabase/loyalty-order-columns.sql (colunas em orders).

-- store_loyalty_config
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

-- loyalty_accounts
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

-- loyalty_ledger
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

ALTER TABLE public.store_loyalty_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_loyalty_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_ledger TO authenticated;
