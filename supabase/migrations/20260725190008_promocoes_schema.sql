-- Promoções: campanhas guiadas (store_promotions) e preços promocionais em produtos.
-- Idempotente — aplicar no SQL Editor do Supabase se a janela Promoções falhar.

-- ---------------------------------------------------------------------------
-- store_promotions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  valid_until date,
  promotional_price numeric(12, 2),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_promotions
  ADD COLUMN IF NOT EXISTS name text;

ALTER TABLE public.store_promotions
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.store_promotions
  ADD COLUMN IF NOT EXISTS valid_until date;

ALTER TABLE public.store_promotions
  ADD COLUMN IF NOT EXISTS promotional_price numeric(12, 2);

ALTER TABLE public.store_promotions
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE public.store_promotions
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Legado: titulo / ativo → name / active
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_promotions' AND column_name = 'titulo'
  ) THEN
    UPDATE public.store_promotions
    SET name = COALESCE(NULLIF(btrim(titulo), ''), 'Promoção')
    WHERE name IS NULL OR btrim(name) = '';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'store_promotions' AND column_name = 'ativo'
  ) THEN
    UPDATE public.store_promotions
    SET active = COALESCE(ativo, true)
    WHERE active IS NULL;
  END IF;
END $$;

UPDATE public.store_promotions
SET name = 'Promoção'
WHERE name IS NULL OR btrim(name) = '';

UPDATE public.store_promotions
SET active = true
WHERE active IS NULL;

COMMENT ON TABLE public.store_promotions IS
  'Campanhas promocionais da loja (assistente guiado no painel Promoções).';

CREATE INDEX IF NOT EXISTS idx_store_promotions_store_active_created
  ON public.store_promotions (store_id, active, created_at DESC);

-- ---------------------------------------------------------------------------
-- products: preços promocionais por canal (cardápio / PDV / delivery)
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS promotional_price numeric(12, 2);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS promotion_active boolean NOT NULL DEFAULT false;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS delivery_promotional_price numeric(12, 2);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS delivery_promotion_active boolean NOT NULL DEFAULT false;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS dine_in_promotional_price numeric(12, 2);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS dine_in_promotion_active boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- RLS: store_promotions (Growth+)
-- ---------------------------------------------------------------------------
ALTER TABLE public.store_promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_promotions_owner_del ON public.store_promotions;
DROP POLICY IF EXISTS store_promotions_owner_ins ON public.store_promotions;
DROP POLICY IF EXISTS store_promotions_owner_upd ON public.store_promotions;

DROP POLICY IF EXISTS store_promotions_owner_sel ON public.store_promotions;
CREATE POLICY store_promotions_owner_sel
  ON public.store_promotions
  FOR SELECT
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS store_promotions_owner_ins ON public.store_promotions;
CREATE POLICY store_promotions_owner_ins
  ON public.store_promotions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS store_promotions_owner_upd ON public.store_promotions;
CREATE POLICY store_promotions_owner_upd
  ON public.store_promotions
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

DROP POLICY IF EXISTS store_promotions_owner_del ON public.store_promotions;
CREATE POLICY store_promotions_owner_del
  ON public.store_promotions
  FOR DELETE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_promotions TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
