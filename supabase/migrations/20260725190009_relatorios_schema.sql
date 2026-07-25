-- Relatórios: pedidos, itens, produtos e financeiro para o dashboard analítico.
-- Idempotente — aplicar no SQL Editor do Supabase se a janela Relatórios falhar.
-- Financeiro completo: aplicar também 20260725190007_caixa_schema.sql se a secção Financeiro falhar.

-- ---------------------------------------------------------------------------
-- orders (faturamento, ticket, mix de pagamentos)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  total numeric(12, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total numeric(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_orders_store_created
  ON public.orders (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_store_status_created
  ON public.orders (store_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- order_items (produtos mais vendidos, promoções)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  price numeric(12, 2) NOT NULL DEFAULT 0,
  unit_price numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS unit_price numeric(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS price numeric(12, 2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product_id
  ON public.order_items (product_id)
  WHERE product_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- products (nome, preço, flag de promoção)
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS promotion_active boolean NOT NULL DEFAULT false;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS promotional_price numeric(12, 2);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price numeric(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS name text;

-- ---------------------------------------------------------------------------
-- suppliers + financial_entries (bloco Financeiro nos relatórios)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  nome text NOT NULL,
  telefone text,
  email text,
  categoria text,
  cnpj text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS cnpj text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS observacao text;

CREATE TABLE IF NOT EXISTS public.financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  categoria text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  valor numeric(12, 2) NOT NULL DEFAULT 0,
  vencimento timestamptz,
  data_pagamento timestamptz,
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_entries_tipo_check CHECK (tipo IN ('receita', 'despesa')),
  CONSTRAINT financial_entries_status_check CHECK (status IN ('pendente', 'pago')),
  CONSTRAINT financial_entries_valor_check CHECK (valor >= 0)
);

CREATE INDEX IF NOT EXISTS idx_financial_entries_store_created
  ON public.financial_entries (store_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS: orders (listagem analítica)
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_owner_select ON public.orders;
CREATE POLICY orders_owner_select
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (public.auth_owns_store(store_id));

GRANT SELECT ON public.orders TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: order_items
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_items_owner_all ON public.order_items;
CREATE POLICY order_items_owner_all
  ON public.order_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.store_owner_can_operate(o.store_id)
        AND public.store_plan_tier_at_least(o.store_id, 1)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.store_owner_can_operate(o.store_id)
        AND public.store_plan_tier_at_least(o.store_id, 1)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: products (SELECT para relatório de promoções)
-- ---------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_owner_select ON public.products;
CREATE POLICY products_owner_select
  ON public.products
  FOR SELECT
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

-- ---------------------------------------------------------------------------
-- RLS: financeiro (Growth+ com Caixa / relatórios)
-- ---------------------------------------------------------------------------
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppliers_owner_sel ON public.suppliers;
CREATE POLICY suppliers_owner_sel
  ON public.suppliers
  FOR SELECT
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

DROP POLICY IF EXISTS suppliers_owner_ins ON public.suppliers;
CREATE POLICY suppliers_owner_ins
  ON public.suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

DROP POLICY IF EXISTS suppliers_owner_upd ON public.suppliers;
CREATE POLICY suppliers_owner_upd
  ON public.suppliers
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

DROP POLICY IF EXISTS suppliers_owner_del ON public.suppliers;
CREATE POLICY suppliers_owner_del
  ON public.suppliers
  FOR DELETE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;

ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_entries_owner_sel ON public.financial_entries;
CREATE POLICY financial_entries_owner_sel
  ON public.financial_entries
  FOR SELECT
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

DROP POLICY IF EXISTS financial_entries_owner_ins ON public.financial_entries;
CREATE POLICY financial_entries_owner_ins
  ON public.financial_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

DROP POLICY IF EXISTS financial_entries_owner_upd ON public.financial_entries;
CREATE POLICY financial_entries_owner_upd
  ON public.financial_entries
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

DROP POLICY IF EXISTS financial_entries_owner_del ON public.financial_entries;
CREATE POLICY financial_entries_owner_del
  ON public.financial_entries
  FOR DELETE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_entries TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
