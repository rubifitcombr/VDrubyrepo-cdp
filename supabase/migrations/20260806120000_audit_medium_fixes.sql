-- Correções médias das auditorias QA + Master (idempotência garçom, fidelidade snapshot, WhatsApp unique, PATCH atómico).

-- ---------------------------------------------------------------------------
-- Fidelidade: snapshot da regra no pedido (earn usa valor da compra, não da entrega)
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS loyalty_points_per_real_snapshot numeric(8, 2);

COMMENT ON COLUMN public.orders.loyalty_points_per_real_snapshot IS
  'Taxa de pontos/R$ vigente no momento do pedido (fidelidade).';

-- ---------------------------------------------------------------------------
-- Garçom: idempotência de criação de comanda (evita duplicados em retry/race)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.waiter_order_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waiter_order_idempotency_store_key_uidx UNIQUE (store_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_waiter_order_idempotency_order
  ON public.waiter_order_idempotency (order_id);

ALTER TABLE public.waiter_order_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waiter_order_idempotency_service ON public.waiter_order_idempotency;
CREATE POLICY waiter_order_idempotency_service ON public.waiter_order_idempotency
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = waiter_order_idempotency.store_id
        AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = waiter_order_idempotency.store_id
        AND s.owner_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, DELETE ON public.waiter_order_idempotency TO authenticated;

-- ---------------------------------------------------------------------------
-- WhatsApp: phone_number_id único entre lojas activas
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS store_whatsapp_config_active_phone_uidx
  ON public.store_whatsapp_config (phone_number_id)
  WHERE status = 'active' AND phone_number_id IS NOT NULL AND btrim(phone_number_id) <> '';

-- ---------------------------------------------------------------------------
-- Garçom PATCH: substituição atómica de itens (DELETE + INSERT numa transacção)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_order_items_for_order(
  p_order_id uuid,
  p_store_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'invalid_items';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id AND o.store_id = p_store_id
  ) THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  DELETE FROM public.order_items WHERE order_id = p_order_id;

  INSERT INTO public.order_items (
    order_id,
    store_id,
    product_id,
    quantity,
    price,
    unit_price,
    name,
    unit_type,
    weight_kg,
    price_per_kg_snapshot,
    addons
  )
  SELECT
    p_order_id,
    p_store_id,
    NULLIF(item->>'product_id', '')::uuid,
    COALESCE((item->>'quantity')::numeric, 1),
    COALESCE((item->>'price')::numeric, 0),
    COALESCE((item->>'unit_price')::numeric, 0),
    COALESCE(NULLIF(item->>'name', ''), 'Item'),
    COALESCE(NULLIF(item->>'unit_type', ''), 'unit'),
    NULLIF(item->>'weight_kg', '')::numeric,
    NULLIF(item->>'price_per_kg_snapshot', '')::numeric,
    CASE
      WHEN item->'addons' IS NULL OR item->'addons' = 'null'::jsonb THEN NULL
      ELSE item->'addons'
    END
  FROM jsonb_array_elements(p_items) AS item;

  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'empty_items';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_order_items_for_order(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_order_items_for_order(uuid, uuid, jsonb) TO authenticated;
