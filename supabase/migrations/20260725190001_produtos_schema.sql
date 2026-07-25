-- Produtos / cardápio: cardapio_meta, schema base, adicionais, categorias e RLS.
-- Idempotente — aplicar no SQL Editor do Supabase se o gestor de Produtos falhar.

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(12, 2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS promotional_price numeric(12, 2);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS promotion_active boolean NOT NULL DEFAULT false;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS delivery_price numeric(12, 2);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS dine_in_price numeric(12, 2);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS delivery_promotional_price numeric(12, 2);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS delivery_promotion_active boolean NOT NULL DEFAULT false;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS dine_in_promotional_price numeric(12, 2);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS dine_in_promotion_active boolean NOT NULL DEFAULT false;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cardapio_meta jsonb;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ncm text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cfop text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cest text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unidade text DEFAULT 'UN';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS origem text DEFAULT '0';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cst_csosn text;

COMMENT ON TABLE public.products IS
  'Itens do cardápio da loja (gestor Produtos, PDV, Garçom, site público).';
COMMENT ON COLUMN public.products.cardapio_meta IS
  'Metadados do wizard legado (tipo, restrições alimentares, disponibilidade).';

CREATE INDEX IF NOT EXISTS idx_products_store_active_sort
  ON public.products (store_id, active, sort_order, name);

-- ---------------------------------------------------------------------------
-- categories (importação IA de cardápio)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_store_sort
  ON public.categories (store_id, sort_order, name);

-- ---------------------------------------------------------------------------
-- addon_groups / addon_items (adicionais por produto)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.addon_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  min_select integer NOT NULL DEFAULT 0,
  max_select integer NOT NULL DEFAULT 1,
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.addon_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.addon_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(12, 2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_addon_groups_product_sort
  ON public.addon_groups (product_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_addon_items_group_sort
  ON public.addon_items (group_id, sort_order);

-- ---------------------------------------------------------------------------
-- RLS: products (owner + cardápio público)
-- ---------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_owner_select ON public.products;
CREATE POLICY products_owner_select
  ON public.products
  FOR SELECT
  TO authenticated
  USING (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS products_public_select ON public.products;
CREATE POLICY products_public_select
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (
    public.store_is_public_active(store_id)
    AND active IS TRUE
  );

DROP POLICY IF EXISTS products_owner_insert ON public.products;
CREATE POLICY products_owner_insert
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (public.store_owner_can_operate(store_id));

DROP POLICY IF EXISTS products_owner_update ON public.products;
CREATE POLICY products_owner_update
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (public.store_owner_can_operate(store_id))
  WITH CHECK (public.store_owner_can_operate(store_id));

DROP POLICY IF EXISTS products_owner_delete ON public.products;
CREATE POLICY products_owner_delete
  ON public.products
  FOR DELETE
  TO authenticated
  USING (public.store_owner_can_operate(store_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT ON public.products TO anon;

-- ---------------------------------------------------------------------------
-- RLS: categories
-- ---------------------------------------------------------------------------
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_owner_all ON public.categories;
CREATE POLICY categories_owner_all
  ON public.categories
  FOR ALL
  TO authenticated
  USING (public.store_owner_can_operate(store_id))
  WITH CHECK (public.store_owner_can_operate(store_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: adicionais (owner + leitura pública no cardápio)
-- ---------------------------------------------------------------------------
ALTER TABLE public.addon_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS addon_groups_owner_all ON public.addon_groups;
CREATE POLICY addon_groups_owner_all
  ON public.addon_groups
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = addon_groups.product_id
        AND public.store_owner_can_operate(p.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = addon_groups.product_id
        AND public.store_owner_can_operate(p.store_id)
    )
  );

DROP POLICY IF EXISTS addon_groups_public_select ON public.addon_groups;
CREATE POLICY addon_groups_public_select
  ON public.addon_groups
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = addon_groups.product_id
        AND p.active IS TRUE
        AND public.store_is_public_active(p.store_id)
    )
  );

ALTER TABLE public.addon_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS addon_items_owner_all ON public.addon_items;
CREATE POLICY addon_items_owner_all
  ON public.addon_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.addon_groups g
      JOIN public.products p ON p.id = g.product_id
      WHERE g.id = addon_items.group_id
        AND public.store_owner_can_operate(p.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.addon_groups g
      JOIN public.products p ON p.id = g.product_id
      WHERE g.id = addon_items.group_id
        AND public.store_owner_can_operate(p.store_id)
    )
  );

DROP POLICY IF EXISTS addon_items_public_select ON public.addon_items;
CREATE POLICY addon_items_public_select
  ON public.addon_items
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.addon_groups g
      JOIN public.products p ON p.id = g.product_id
      WHERE g.id = addon_items.group_id
        AND p.active IS TRUE
        AND public.store_is_public_active(p.store_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.addon_groups TO authenticated;
GRANT SELECT ON public.addon_groups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addon_items TO authenticated;
GRANT SELECT ON public.addon_items TO anon;

SELECT pg_notify('pgrst', 'reload schema');
