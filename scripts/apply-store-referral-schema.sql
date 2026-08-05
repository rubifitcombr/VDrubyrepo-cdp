-- Programa Indique e Ganhe — aplicar no SQL Editor do Supabase
-- (cópia de supabase/migrations/20260805120000_store_referral_schema.sql)

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS referred_by_store_id uuid REFERENCES stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stores_referred_by ON stores(referred_by_store_id)
  WHERE referred_by_store_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS store_referral_accounts (
  store_id uuid PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  referral_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  referred_store_id uuid NOT NULL UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'activated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_store_referrals_referrer ON store_referrals(referrer_store_id);
CREATE INDEX IF NOT EXISTS idx_store_referrals_status ON store_referrals(referrer_store_id, status);

CREATE TABLE IF NOT EXISTS store_referral_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  points_spent integer NOT NULL CHECK (points_spent > 0),
  plano_vence_em_before date,
  plano_vence_em_after date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_referral_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text NOT NULL,
  referral_id uuid REFERENCES store_referrals(id) ON DELETE SET NULL,
  redemption_id uuid REFERENCES store_referral_redemptions(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_referral_ledger_store ON store_referral_ledger(store_id, created_at DESC);

ALTER TABLE public.store_referral_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_referral_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_referral_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_referral_accounts_owner ON public.store_referral_accounts;
CREATE POLICY store_referral_accounts_owner
  ON public.store_referral_accounts FOR ALL TO authenticated
  USING (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 1))
  WITH CHECK (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 1));

DROP POLICY IF EXISTS store_referrals_referrer ON public.store_referrals;
CREATE POLICY store_referrals_referrer
  ON public.store_referrals FOR SELECT TO authenticated
  USING (public.auth_owns_store(referrer_store_id) AND public.store_plan_tier_at_least(referrer_store_id, 1));

DROP POLICY IF EXISTS store_referral_ledger_owner ON public.store_referral_ledger;
CREATE POLICY store_referral_ledger_owner
  ON public.store_referral_ledger FOR SELECT TO authenticated
  USING (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 1));

DROP POLICY IF EXISTS store_referral_redemptions_owner ON public.store_referral_redemptions;
CREATE POLICY store_referral_redemptions_owner
  ON public.store_referral_redemptions FOR SELECT TO authenticated
  USING (public.auth_owns_store(store_id) AND public.store_plan_tier_at_least(store_id, 1));

REVOKE ALL ON public.store_referral_accounts FROM anon;
REVOKE ALL ON public.store_referrals FROM anon;
REVOKE ALL ON public.store_referral_ledger FROM anon;
REVOKE ALL ON public.store_referral_redemptions FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_referral_accounts TO authenticated;
GRANT SELECT ON public.store_referrals TO authenticated;
GRANT SELECT ON public.store_referral_ledger TO authenticated;
GRANT SELECT ON public.store_referral_redemptions TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
