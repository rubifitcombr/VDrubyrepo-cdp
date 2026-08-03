-- =============================================================================
-- Vyria — order_items.store_id para Realtime por loja
-- =============================================================================
-- Cole no SQL Editor do Supabase (projeto de produção/staging) e execute de uma vez.
-- Idempotente — seguro reexecutar.
--
-- Inclui:
--   20260731170000_order_items_store_id.sql
--   20260731180000_order_items_store_id_hardening.sql
--
-- Deploy: aplicar ESTE script ANTES de publicar o código com filtro
--         store_id=eq.{id} em StoreOperationalRealtimeBridge (order_items).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Parte 1 — denormalização + trigger
-- ---------------------------------------------------------------------------

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

UPDATE public.order_items oi
SET store_id = o.store_id
FROM public.orders o
WHERE oi.order_id = o.id
  AND oi.store_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_store_id
  ON public.order_items (store_id)
  WHERE store_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_order_items_store_id_from_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.store_id IS NULL THEN
    SELECT o.store_id INTO NEW.store_id
    FROM public.orders o
    WHERE o.id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_set_store_id ON public.order_items;
CREATE TRIGGER trg_order_items_set_store_id
  BEFORE INSERT OR UPDATE OF order_id ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_items_store_id_from_order();

COMMENT ON COLUMN public.order_items.store_id IS
  'Denormalizado de orders.store_id — permite filter Realtime store_id=eq.{id}.';

-- ---------------------------------------------------------------------------
-- Parte 2 — hardening (NOT NULL, REPLICA IDENTITY FULL, RLS)
-- ---------------------------------------------------------------------------

UPDATE public.order_items oi
SET store_id = o.store_id
FROM public.orders o
WHERE oi.order_id = o.id
  AND oi.store_id IS DISTINCT FROM o.store_id;

DELETE FROM public.order_items oi
WHERE oi.store_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = oi.order_id
  );

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

ALTER TABLE public.order_items REPLICA IDENTITY FULL;

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

COMMIT;

-- ---------------------------------------------------------------------------
-- Verificação (opcional — rode após o COMMIT)
-- ---------------------------------------------------------------------------
-- SELECT count(*) AS null_store_id FROM public.order_items WHERE store_id IS NULL;
-- SELECT relreplident FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relname = 'order_items';
--   -- 'f' = FULL (esperado)
-- SELECT tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' AND tablename = 'order_items';
