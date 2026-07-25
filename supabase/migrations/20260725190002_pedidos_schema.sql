-- Pedidos: schema base (orders, itens, pagamentos, entregas) e RLS completo.
-- Idempotente — aplicar no SQL Editor do Supabase se a janela Pedidos falhar.

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  total numeric(12, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_address text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_fee numeric(12, 2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status character varying;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pix_payload text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pix_paid_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items_summary text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS caixa_turno_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS entregador_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS entregador_nome text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS entrega_despachada_em timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS entrega_prazo_minutos integer NOT NULL DEFAULT 45;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS garcom_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS garcom_nome text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_fee_brl numeric(12, 2);

COMMENT ON TABLE public.orders IS
  'Pedidos da loja (site, PDV, garçom, QR mesa).';

CREATE INDEX IF NOT EXISTS idx_orders_store_created
  ON public.orders (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_store_status_created
  ON public.orders (store_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- order_items
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

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- order_payments (pagamentos parciais / split no caixa)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  amount_brl numeric(12, 2) NOT NULL,
  caixa_turno_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_payments_store_order
  ON public.order_payments (store_id, order_id);

-- ---------------------------------------------------------------------------
-- entregas (corrida do entregador ligada ao pedido)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  entregador_id uuid,
  entregador_nome text NOT NULL,
  valor_corrida numeric(12, 2) NOT NULL DEFAULT 0,
  valor_recebido_cliente numeric(12, 2) NOT NULL DEFAULT 0,
  forma_pagamento_entrega text,
  turno_id uuid,
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  acerto_movimentacao_id uuid,
  acertado_em timestamptz
);

CREATE INDEX IF NOT EXISTS idx_entregas_store_criado
  ON public.entregas (store_id, criado_em DESC);

CREATE UNIQUE INDEX IF NOT EXISTS entregas_store_order_uidx
  ON public.entregas (store_id, order_id);

-- ---------------------------------------------------------------------------
-- RLS: orders (owner + checkout público)
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_owner_select ON public.orders;
CREATE POLICY orders_owner_select
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS orders_public_select_recent ON public.orders;
CREATE POLICY orders_public_select_recent
  ON public.orders
  FOR SELECT
  TO anon, authenticated
  USING (
    public.store_is_public_active(store_id)
    AND created_at > (now() - interval '2 hours')
  );

DROP POLICY IF EXISTS orders_owner_insert ON public.orders;
CREATE POLICY orders_owner_insert
  ON public.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS orders_owner_update ON public.orders;
CREATE POLICY orders_owner_update
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  )
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS orders_owner_delete ON public.orders;
CREATE POLICY orders_owner_delete
  ON public.orders
  FOR DELETE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS orders_public_insert ON public.orders;
CREATE POLICY orders_public_insert
  ON public.orders
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (public.store_is_public_active(store_id));

DROP POLICY IF EXISTS orders_public_update_checkout ON public.orders;
CREATE POLICY orders_public_update_checkout
  ON public.orders
  FOR UPDATE
  TO anon, authenticated
  USING (
    public.store_is_public_active(store_id)
    AND created_at > (now() - interval '2 hours')
  )
  WITH CHECK (public.store_is_public_active(store_id));

DROP POLICY IF EXISTS orders_public_delete_recent ON public.orders;
CREATE POLICY orders_public_delete_recent
  ON public.orders
  FOR DELETE
  TO anon, authenticated
  USING (
    public.store_is_public_active(store_id)
    AND created_at > (now() - interval '30 minutes')
    AND status = 'pending'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO anon;

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

DROP POLICY IF EXISTS order_items_public_insert ON public.order_items;
CREATE POLICY order_items_public_insert
  ON public.order_items
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.store_is_public_active(o.store_id)
    )
  );

DROP POLICY IF EXISTS order_items_public_delete ON public.order_items;
CREATE POLICY order_items_public_delete
  ON public.order_items
  FOR DELETE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.store_is_public_active(o.store_id)
        AND o.created_at > (now() - interval '30 minutes')
        AND o.status = 'pending'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT INSERT, DELETE ON public.order_items TO anon;

-- ---------------------------------------------------------------------------
-- RLS: order_payments
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_payments_owner_select ON public.order_payments;
CREATE POLICY order_payments_owner_select
  ON public.order_payments
  FOR SELECT
  TO authenticated
  USING (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS order_payments_owner_insert ON public.order_payments;
CREATE POLICY order_payments_owner_insert
  ON public.order_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS order_payments_owner_delete ON public.order_payments;
CREATE POLICY order_payments_owner_delete
  ON public.order_payments
  FOR DELETE
  TO authenticated
  USING (public.auth_owns_store(store_id));

GRANT SELECT, INSERT, DELETE ON public.order_payments TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: entregas (lista no painel Pedidos)
-- ---------------------------------------------------------------------------
ALTER TABLE public.entregas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entregas_owner_sel ON public.entregas;
CREATE POLICY entregas_owner_sel
  ON public.entregas
  FOR SELECT
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS entregas_owner_ins ON public.entregas;
CREATE POLICY entregas_owner_ins
  ON public.entregas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS entregas_owner_upd ON public.entregas;
CREATE POLICY entregas_owner_upd
  ON public.entregas
  FOR UPDATE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  )
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS entregas_owner_del ON public.entregas;
CREATE POLICY entregas_owner_del
  ON public.entregas
  FOR DELETE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entregas TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: store_entregadores (modal «Despachar» em Pedidos)
-- ---------------------------------------------------------------------------
ALTER TABLE public.store_entregadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_entregadores_owner_sel ON public.store_entregadores;
CREATE POLICY store_entregadores_owner_sel
  ON public.store_entregadores
  FOR SELECT
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS store_entregadores_owner_ins ON public.store_entregadores;
CREATE POLICY store_entregadores_owner_ins
  ON public.store_entregadores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS store_entregadores_owner_upd ON public.store_entregadores;
CREATE POLICY store_entregadores_owner_upd
  ON public.store_entregadores
  FOR UPDATE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  )
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS store_entregadores_owner_del ON public.store_entregadores;
CREATE POLICY store_entregadores_owner_del
  ON public.store_entregadores
  FOR DELETE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_entregadores TO authenticated;

-- ---------------------------------------------------------------------------
-- Realtime (Pedidos, KDS, Garçom, Caixa)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  END IF;
END $$;

SELECT pg_notify('pgrst', 'reload schema');
