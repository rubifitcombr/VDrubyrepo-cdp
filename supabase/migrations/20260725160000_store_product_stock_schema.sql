-- Inventário: alinha store_product_stock ao que a app espera (quantity, alerta, upsert por loja+produto).

ALTER TABLE public.store_product_stock
  ADD COLUMN IF NOT EXISTS quantity integer;

ALTER TABLE public.store_product_stock
  ADD COLUMN IF NOT EXISTS low_stock_alert integer;

ALTER TABLE public.store_product_stock
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'store_product_stock'
      AND column_name = 'quantidade'
  ) THEN
    UPDATE public.store_product_stock
    SET quantity = quantidade
    WHERE quantity IS NULL;

    ALTER TABLE public.store_product_stock DROP COLUMN quantidade;
  END IF;
END $$;

UPDATE public.store_product_stock
SET quantity = 0
WHERE quantity IS NULL;

ALTER TABLE public.store_product_stock
  ALTER COLUMN quantity SET DEFAULT 0;

ALTER TABLE public.store_product_stock
  ALTER COLUMN quantity SET NOT NULL;

-- Remove duplicados (mantém a linha mais recente por id) antes do índice único.
DELETE FROM public.store_product_stock a
USING public.store_product_stock b
WHERE a.store_id = b.store_id
  AND a.product_id = b.product_id
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS store_product_stock_store_product_uidx
  ON public.store_product_stock (store_id, product_id);

ALTER TABLE public.store_product_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_product_stock_owner_sel ON public.store_product_stock;
CREATE POLICY store_product_stock_owner_sel ON public.store_product_stock
  FOR SELECT TO authenticated
  USING (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS store_product_stock_select ON public.store_product_stock;
DROP POLICY IF EXISTS store_product_stock_write ON public.store_product_stock;

DROP POLICY IF EXISTS store_product_stock_owner_ins ON public.store_product_stock;
CREATE POLICY store_product_stock_owner_ins ON public.store_product_stock
  FOR INSERT TO authenticated
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

DROP POLICY IF EXISTS store_product_stock_owner_upd ON public.store_product_stock;
CREATE POLICY store_product_stock_owner_upd ON public.store_product_stock
  FOR UPDATE TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  )
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

DROP POLICY IF EXISTS store_product_stock_owner_del ON public.store_product_stock;
CREATE POLICY store_product_stock_owner_del ON public.store_product_stock
  FOR DELETE TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_product_stock TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
