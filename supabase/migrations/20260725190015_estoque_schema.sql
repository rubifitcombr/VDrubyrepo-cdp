-- Estoque (/dashboard/inventory): quantidades por produto e alerta de stock baixo.
-- Idempotente — aplicar no SQL Editor do Supabase se a janela Estoque falhar ao guardar.
-- Produtos: também 20260725190001_produtos_schema.sql se a lista de produtos estiver vazia.

-- ---------------------------------------------------------------------------
-- store_product_stock
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_product_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  low_stock_alert integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_product_stock
  ADD COLUMN IF NOT EXISTS quantity integer;

ALTER TABLE public.store_product_stock
  ADD COLUMN IF NOT EXISTS low_stock_alert integer;

ALTER TABLE public.store_product_stock
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Legado: quantidade → quantity
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

-- Remove duplicados (mantém a linha com menor id) antes do índice único.
DELETE FROM public.store_product_stock a
USING public.store_product_stock b
WHERE a.store_id = b.store_id
  AND a.product_id = b.product_id
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS store_product_stock_store_product_uidx
  ON public.store_product_stock (store_id, product_id);

CREATE INDEX IF NOT EXISTS idx_store_product_stock_store_id
  ON public.store_product_stock (store_id);

COMMENT ON TABLE public.store_product_stock IS
  'Stock por produto da loja (Gestão de Estoque — plano Pro).';

-- ---------------------------------------------------------------------------
-- RLS: leitura pelo owner; escrita requer plano Pro (tier >= 2)
-- ---------------------------------------------------------------------------
ALTER TABLE public.store_product_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_product_stock_owner_sel ON public.store_product_stock;
CREATE POLICY store_product_stock_owner_sel
  ON public.store_product_stock
  FOR SELECT
  TO authenticated
  USING (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS store_product_stock_select ON public.store_product_stock;
DROP POLICY IF EXISTS store_product_stock_write ON public.store_product_stock;

DROP POLICY IF EXISTS store_product_stock_owner_ins ON public.store_product_stock;
CREATE POLICY store_product_stock_owner_ins
  ON public.store_product_stock
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

DROP POLICY IF EXISTS store_product_stock_owner_upd ON public.store_product_stock;
CREATE POLICY store_product_stock_owner_upd
  ON public.store_product_stock
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

DROP POLICY IF EXISTS store_product_stock_owner_del ON public.store_product_stock;
CREATE POLICY store_product_stock_owner_del
  ON public.store_product_stock
  FOR DELETE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_product_stock TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
