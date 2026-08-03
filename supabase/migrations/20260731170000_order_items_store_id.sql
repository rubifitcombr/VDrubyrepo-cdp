-- Denormaliza store_id em order_items para filtro Realtime por loja
-- (PostgREST Realtime não suporta join/subquery no filter).

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
  'Denormalizado de orders.store_id — permite filter Realtime store_id=eq.{id}. Ver também 20260731180000 (NOT NULL, REPLICA IDENTITY FULL, RLS).';
