-- Meus garçons: cadastro, PIN e relatório de vendas no salão.
-- Idempotente — aplicar no SQL Editor do Supabase se a janela Meus garçons falhar.

-- ---------------------------------------------------------------------------
-- store_garcons
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_garcons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  pin text,
  pin_ativo boolean NOT NULL DEFAULT false,
  email text,
  telefone text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_garcons
  ADD COLUMN IF NOT EXISTS pin text;

ALTER TABLE public.store_garcons
  ADD COLUMN IF NOT EXISTS pin_ativo boolean NOT NULL DEFAULT false;

ALTER TABLE public.store_garcons
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.store_garcons
  ADD COLUMN IF NOT EXISTS telefone text;

ALTER TABLE public.store_garcons
  ADD COLUMN IF NOT EXISTS criado_em timestamptz NOT NULL DEFAULT now();

COMMENT ON TABLE public.store_garcons IS
  'Garçons da loja (PIN de 4 dígitos, relatório de vendas no salão).';

CREATE INDEX IF NOT EXISTS idx_store_garcons_store_ativo
  ON public.store_garcons (store_id, ativo);

CREATE INDEX IF NOT EXISTS idx_store_garcons_store_nome
  ON public.store_garcons (store_id, nome);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_garcons_store_pin_active
  ON public.store_garcons (store_id, pin)
  WHERE pin IS NOT NULL AND pin_ativo = true;

-- ---------------------------------------------------------------------------
-- orders: garçom e taxa de serviço (relatório + fecho de comanda)
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS garcom_id uuid;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS garcom_nome text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_fee_brl numeric(12, 2);

COMMENT ON COLUMN public.orders.garcom_id IS
  'Garçom que registou/fechou a comanda (store_garcons.id).';
COMMENT ON COLUMN public.orders.garcom_nome IS
  'Nome do garçom no momento do pedido (desnormalizado).';
COMMENT ON COLUMN public.orders.service_fee_brl IS
  'Taxa de serviço (gorjeta) em BRL na comanda de mesa.';

CREATE INDEX IF NOT EXISTS idx_orders_store_garcom_created
  ON public.orders (store_id, garcom_id, created_at DESC)
  WHERE source = 'waiter' AND garcom_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS: store_garcons (Pro — gestão de garçons e PIN)
-- ---------------------------------------------------------------------------
ALTER TABLE public.store_garcons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_garcons_select_owner ON public.store_garcons;
DROP POLICY IF EXISTS store_garcons_insert_owner ON public.store_garcons;
DROP POLICY IF EXISTS store_garcons_update_owner ON public.store_garcons;
DROP POLICY IF EXISTS store_garcons_delete_owner ON public.store_garcons;

DROP POLICY IF EXISTS store_garcons_owner_sel ON public.store_garcons;
CREATE POLICY store_garcons_owner_sel
  ON public.store_garcons
  FOR SELECT
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

DROP POLICY IF EXISTS store_garcons_owner_ins ON public.store_garcons;
CREATE POLICY store_garcons_owner_ins
  ON public.store_garcons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

DROP POLICY IF EXISTS store_garcons_owner_upd ON public.store_garcons;
CREATE POLICY store_garcons_owner_upd
  ON public.store_garcons
  FOR UPDATE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  )
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

DROP POLICY IF EXISTS store_garcons_owner_del ON public.store_garcons;
CREATE POLICY store_garcons_owner_del
  ON public.store_garcons
  FOR DELETE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_garcons TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
