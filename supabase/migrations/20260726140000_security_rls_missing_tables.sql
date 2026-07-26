-- Activa RLS nas tabelas sinalizadas pelo Security Advisor do Supabase.
-- Idempotente — corrige também colunas em falta usadas pela app.

-- ---------------------------------------------------------------------------
-- store_push_subscriptions (policies já existiam; RLS estava OFF)
-- ---------------------------------------------------------------------------
ALTER TABLE public.store_push_subscriptions
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS p256dh text,
  ADD COLUMN IF NOT EXISTS auth text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS store_push_subscriptions_endpoint_uidx
  ON public.store_push_subscriptions (endpoint);

ALTER TABLE public.store_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_push_subscriptions_owner_sel ON public.store_push_subscriptions;
CREATE POLICY store_push_subscriptions_owner_sel
  ON public.store_push_subscriptions
  FOR SELECT
  TO authenticated
  USING (public.store_owner_can_operate(store_id));

DROP POLICY IF EXISTS store_push_subscriptions_owner_ins ON public.store_push_subscriptions;
CREATE POLICY store_push_subscriptions_owner_ins
  ON public.store_push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 0)
  );

DROP POLICY IF EXISTS store_push_subscriptions_owner_upd ON public.store_push_subscriptions;
CREATE POLICY store_push_subscriptions_owner_upd
  ON public.store_push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 0)
  )
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 0)
  );

DROP POLICY IF EXISTS store_push_subscriptions_owner_del ON public.store_push_subscriptions;
CREATE POLICY store_push_subscriptions_owner_del
  ON public.store_push_subscriptions
  FOR DELETE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 0)
  );

REVOKE ALL ON public.store_push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_push_subscriptions TO authenticated;

-- ---------------------------------------------------------------------------
-- faturas — lojista vê só as suas; admin escreve via service role
-- ---------------------------------------------------------------------------
ALTER TABLE public.faturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS faturas_owner_select ON public.faturas;
CREATE POLICY faturas_owner_select
  ON public.faturas
  FOR SELECT
  TO authenticated
  USING (public.auth_owns_store(store_id));

REVOKE ALL ON public.faturas FROM anon;
GRANT SELECT ON public.faturas TO authenticated;

-- ---------------------------------------------------------------------------
-- contrato_aceites — só backend (service role); sem acesso anon/authenticated
-- ---------------------------------------------------------------------------
ALTER TABLE public.contrato_aceites ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.contrato_aceites FROM anon;
REVOKE ALL ON public.contrato_aceites FROM authenticated;

-- ---------------------------------------------------------------------------
-- admin_logs — auditoria admin; só service role
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_logs
  ADD COLUMN IF NOT EXISTS admin_id uuid,
  ADD COLUMN IF NOT EXISTS lojista_id uuid;

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_logs FROM anon;
REVOKE ALL ON public.admin_logs FROM authenticated;

-- ---------------------------------------------------------------------------
-- admin_notifications — painel admin; só service role
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_notifications FROM anon;
REVOKE ALL ON public.admin_notifications FROM authenticated;

SELECT pg_notify('pgrst', 'reload schema');
