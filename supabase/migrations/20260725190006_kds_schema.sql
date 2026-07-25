-- KDS: fila da cozinha (orders pending / preparing / ready) e sync em tempo real.
-- Idempotente — aplicar no SQL Editor do Supabase se a janela KDS falhar.
-- Depende de pedidos (20260725190002).

-- ---------------------------------------------------------------------------
-- orders: colunas lidas pelo KDS (ORDER_SELECT)
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
  'Pedidos da loja (site, PDV, garçom, QR mesa) — fila KDS em pending/preparing/ready.';

CREATE INDEX IF NOT EXISTS idx_orders_store_status_created
  ON public.orders (store_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_store_kitchen_queue
  ON public.orders (store_id, created_at DESC)
  WHERE status IN ('pending', 'preparing', 'ready');

-- ---------------------------------------------------------------------------
-- RLS: orders (listagem e mudança de estado no KDS)
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
-- Realtime (KDS, Pedidos, Garçom, Caixa)
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
