-- Cobrança mensal Vyria via Mercado Pago (PIX)

CREATE TABLE IF NOT EXISTS platform_billing_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mp_access_token text,
  mp_webhook_secret text,
  receiver_name text,
  receiver_document text,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO platform_billing_config (id, enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  reference_month text NOT NULL,
  amount_brl numeric(12, 2) NOT NULL CHECK (amount_brl > 0),
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
  plan text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'waived')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_date date NOT NULL,
  paid_at timestamptz,
  mp_payment_id text,
  pix_qr_code text,
  pix_qr_base64 text,
  pix_copy_paste text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, reference_month)
);

CREATE INDEX IF NOT EXISTS idx_subscription_invoices_store_status
  ON subscription_invoices(store_id, status, reference_month DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_invoices_pending_due
  ON subscription_invoices(due_date, status)
  WHERE status = 'pending';

ALTER TABLE platform_billing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_billing_config_deny_all ON platform_billing_config;
CREATE POLICY platform_billing_config_deny_all
  ON platform_billing_config FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS subscription_invoices_owner_select ON subscription_invoices;
CREATE POLICY subscription_invoices_owner_select
  ON subscription_invoices FOR SELECT TO authenticated
  USING (public.auth_owns_store(store_id));

REVOKE ALL ON platform_billing_config FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON subscription_invoices FROM anon;
GRANT SELECT ON subscription_invoices TO authenticated;

COMMENT ON TABLE platform_billing_config IS 'Credenciais Mercado Pago Vyria (singleton). Acesso só via service role.';
COMMENT ON TABLE subscription_invoices IS 'Faturas mensais da assinatura Vyria por loja.';
