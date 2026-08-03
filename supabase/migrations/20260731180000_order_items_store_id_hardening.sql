-- Complemento de 20260731170000: garante Realtime filter store_id em DELETE/UPDATE,
-- integridade de store_id e RLS alinhada à coluna denormalizada.
-- Idempotente — aplicar após 20260731170000_order_items_store_id.sql.

-- ---------------------------------------------------------------------------
-- Backfill (repetir caso 170000 tenha corrido antes de novos inserts)
-- ---------------------------------------------------------------------------
UPDATE public.order_items oi
SET store_id = o.store_id
FROM public.orders o
WHERE oi.order_id = o.id
  AND oi.store_id IS DISTINCT FROM o.store_id;

-- Itens órfãos (pedido apagado) não devem bloquear NOT NULL
DELETE FROM public.order_items oi
WHERE oi.store_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = oi.order_id
  );

-- ---------------------------------------------------------------------------
-- Integridade: store_id obrigatório em novos registos
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.order_items WHERE store_id IS NULL) THEN
    RAISE NOTICE 'order_items: ainda existem linhas com store_id NULL — NOT NULL não aplicado';
  ELSE
    ALTER TABLE public.order_items
      ALTER COLUMN store_id SET NOT NULL;
  END IF;
EXCEPTION
  WHEN object_not_in_prerequisite_state THEN NULL;
END $$;

-- Filtro Realtime em DELETE precisa da linha antiga completa no WAL
ALTER TABLE public.order_items REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- RLS: usar store_id denormalizado (mais rápido; alinhado ao filter Realtime)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS order_items_owner_all ON public.order_items;
CREATE POLICY order_items_owner_all
  ON public.order_items
  FOR ALL
  TO authenticated
  USING (
    order_items.store_id IS NOT NULL
    AND public.store_owner_can_operate(order_items.store_id)
    AND public.store_plan_tier_at_least(order_items.store_id, 1)
  )
  WITH CHECK (
    order_items.store_id IS NOT NULL
    AND public.store_owner_can_operate(order_items.store_id)
    AND public.store_plan_tier_at_least(order_items.store_id, 1)
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.store_id = order_items.store_id
    )
  );

SELECT pg_notify('pgrst', 'reload schema');
