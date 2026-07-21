-- RLS multi-tenant: tabelas core + helpers + leitura pública segura (sem expor segredos da loja).
-- Idempotente — aplicar no SQL Editor do Supabase após auditar tabelas existentes.

-- ─── Helpers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.store_owner_id(p_store_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT owner_id FROM public.stores WHERE id = p_store_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.store_is_public_active(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id = p_store_id
      AND lower(trim(coalesce(nullif(s.status, ''), nullif(s.merchant_status::text, ''), 'pendente'))) = 'ativo'
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_owns_store(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores WHERE id = p_store_id AND owner_id = auth.uid()
  );
$$;

-- Macro-like: políticas owner por store_id
-- (aplicadas manualmente abaixo por tabela)

-- ─── stores ──────────────────────────────────────────────────────────────────
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stores_owner_select ON public.stores;
CREATE POLICY stores_owner_select ON public.stores
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS stores_owner_insert ON public.stores;
CREATE POLICY stores_owner_insert ON public.stores
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS stores_owner_update ON public.stores;
CREATE POLICY stores_owner_update ON public.stores
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS stores_owner_delete ON public.stores;
CREATE POLICY stores_owner_delete ON public.stores
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

REVOKE ALL ON public.stores FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;

-- ─── products ────────────────────────────────────────────────────────────────
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_public_select ON public.products;
CREATE POLICY products_public_select ON public.products
  FOR SELECT TO anon, authenticated
  USING (
    active IS TRUE
    AND public.store_is_public_active(store_id)
  );

DROP POLICY IF EXISTS products_owner_select ON public.products;
CREATE POLICY products_owner_select ON public.products
  FOR SELECT TO authenticated
  USING (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS products_owner_insert ON public.products;
CREATE POLICY products_owner_insert ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS products_owner_update ON public.products;
CREATE POLICY products_owner_update ON public.products
  FOR UPDATE TO authenticated
  USING (public.auth_owns_store(store_id))
  WITH CHECK (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS products_owner_delete ON public.products;
CREATE POLICY products_owner_delete ON public.products
  FOR DELETE TO authenticated
  USING (public.auth_owns_store(store_id));

-- ─── categories (se existir) ─────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.categories') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS categories_public_select ON public.categories';
    EXECUTE $p$
      CREATE POLICY categories_public_select ON public.categories
        FOR SELECT TO anon, authenticated
        USING (public.store_is_public_active(store_id))
    $p$;
    EXECUTE 'DROP POLICY IF EXISTS categories_owner_all ON public.categories';
    EXECUTE $p$
      CREATE POLICY categories_owner_all ON public.categories
        FOR ALL TO authenticated
        USING (public.auth_owns_store(store_id))
        WITH CHECK (public.auth_owns_store(store_id))
    $p$;
  END IF;
END $$;

-- ─── addon_groups / addon_items ──────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.addon_groups') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.addon_groups ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS addon_groups_public_select ON public.addon_groups';
    EXECUTE $p$
      CREATE POLICY addon_groups_public_select ON public.addon_groups
        FOR SELECT TO anon, authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.products p
            WHERE p.id = product_id
              AND p.active IS TRUE
              AND public.store_is_public_active(p.store_id)
          )
        )
    $p$;
    EXECUTE 'DROP POLICY IF EXISTS addon_groups_owner_all ON public.addon_groups';
    EXECUTE $p$
      CREATE POLICY addon_groups_owner_all ON public.addon_groups
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.products p
            WHERE p.id = product_id AND public.auth_owns_store(p.store_id)
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.products p
            WHERE p.id = product_id AND public.auth_owns_store(p.store_id)
          )
        )
    $p$;
  END IF;

  IF to_regclass('public.addon_items') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.addon_items ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS addon_items_public_select ON public.addon_items';
    EXECUTE $p$
      CREATE POLICY addon_items_public_select ON public.addon_items
        FOR SELECT TO anon, authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.addon_groups g
            JOIN public.products p ON p.id = g.product_id
            WHERE g.id = group_id
              AND p.active IS TRUE
              AND public.store_is_public_active(p.store_id)
          )
        )
    $p$;
    EXECUTE 'DROP POLICY IF EXISTS addon_items_owner_all ON public.addon_items';
    EXECUTE $p$
      CREATE POLICY addon_items_owner_all ON public.addon_items
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.addon_groups g
            JOIN public.products p ON p.id = g.product_id
            WHERE g.id = group_id AND public.auth_owns_store(p.store_id)
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.addon_groups g
            JOIN public.products p ON p.id = g.product_id
            WHERE g.id = group_id AND public.auth_owns_store(p.store_id)
          )
        )
    $p$;
  END IF;
END $$;

-- ─── orders ──────────────────────────────────────────────────────────────────
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_public_insert ON public.orders;
CREATE POLICY orders_public_insert ON public.orders
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.store_is_public_active(store_id));

DROP POLICY IF EXISTS orders_public_select_pix ON public.orders;
CREATE POLICY orders_public_select_pix ON public.orders
  FOR SELECT TO anon
  USING (
    public.store_is_public_active(store_id)
    AND lower(coalesce(payment_method, '')) = 'pix'
  );

DROP POLICY IF EXISTS orders_public_update_checkout ON public.orders;
CREATE POLICY orders_public_update_checkout ON public.orders
  FOR UPDATE TO anon
  USING (
    public.store_is_public_active(store_id)
    AND created_at > (now() - interval '2 hours')
  )
  WITH CHECK (public.store_is_public_active(store_id));

DROP POLICY IF EXISTS orders_public_delete_recent ON public.orders;
CREATE POLICY orders_public_delete_recent ON public.orders
  FOR DELETE TO anon
  USING (
    public.store_is_public_active(store_id)
    AND created_at > (now() - interval '30 minutes')
    AND status = 'pending'
  );

DROP POLICY IF EXISTS orders_owner_select ON public.orders;
CREATE POLICY orders_owner_select ON public.orders
  FOR SELECT TO authenticated
  USING (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS orders_owner_insert ON public.orders;
CREATE POLICY orders_owner_insert ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS orders_owner_update ON public.orders;
CREATE POLICY orders_owner_update ON public.orders
  FOR UPDATE TO authenticated
  USING (public.auth_owns_store(store_id))
  WITH CHECK (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS orders_owner_delete ON public.orders;
CREATE POLICY orders_owner_delete ON public.orders
  FOR DELETE TO authenticated
  USING (public.auth_owns_store(store_id));

-- ─── order_items ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.order_items') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS order_items_public_insert ON public.order_items';
    EXECUTE $p$
      CREATE POLICY order_items_public_insert ON public.order_items
        FOR INSERT TO anon, authenticated
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_id
              AND public.store_is_public_active(o.store_id)
              AND o.created_at > (now() - interval '30 minutes')
          )
        )
    $p$;
    EXECUTE 'DROP POLICY IF EXISTS order_items_public_delete ON public.order_items';
    EXECUTE $p$
      CREATE POLICY order_items_public_delete ON public.order_items
        FOR DELETE TO anon
        USING (
          EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_id
              AND public.store_is_public_active(o.store_id)
              AND o.created_at > (now() - interval '30 minutes')
              AND o.status = 'pending'
          )
        )
    $p$;
    EXECUTE 'DROP POLICY IF EXISTS order_items_owner_all ON public.order_items';
    EXECUTE $p$
      CREATE POLICY order_items_owner_all ON public.order_items
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_id AND public.auth_owns_store(o.store_id)
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_id AND public.auth_owns_store(o.store_id)
          )
        )
    $p$;
  END IF;
END $$;

-- ─── Tabelas operacionais (store_id) ─────────────────────────────────────────
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'store_entregadores',
    'entregas',
    'store_garcons',
    'store_tables',
    'caixas_turnos',
    'caixa_movimentacoes',
    'store_promotions',
    'store_product_stock',
    'store_push_subscriptions',
    'store_menu_import_usage',
    'store_marketing_ai_usage',
    'assinatura_cancelamentos',
    'faturas',
    'admin_notifications',
    'contrato_aceites'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('DROP POLICY IF EXISTS %I_owner_sel ON public.%I', tbl, tbl);
      EXECUTE format(
        'CREATE POLICY %I_owner_sel ON public.%I FOR SELECT TO authenticated USING (public.auth_owns_store(store_id))',
        tbl, tbl
      );
      EXECUTE format('DROP POLICY IF EXISTS %I_owner_ins ON public.%I', tbl, tbl);
      EXECUTE format(
        'CREATE POLICY %I_owner_ins ON public.%I FOR INSERT TO authenticated WITH CHECK (public.auth_owns_store(store_id))',
        tbl, tbl
      );
      EXECUTE format('DROP POLICY IF EXISTS %I_owner_upd ON public.%I', tbl, tbl);
      EXECUTE format(
        'CREATE POLICY %I_owner_upd ON public.%I FOR UPDATE TO authenticated USING (public.auth_owns_store(store_id)) WITH CHECK (public.auth_owns_store(store_id))',
        tbl, tbl
      );
      EXECUTE format('DROP POLICY IF EXISTS %I_owner_del ON public.%I', tbl, tbl);
      EXECUTE format(
        'CREATE POLICY %I_owner_del ON public.%I FOR DELETE TO authenticated USING (public.auth_owns_store(store_id))',
        tbl, tbl
      );
    END IF;
  END LOOP;
END $$;

-- entregas: também validar order pertence à loja em INSERT
DO $$
BEGIN
  IF to_regclass('public.entregas') IS NOT NULL THEN
    DROP POLICY IF EXISTS entregas_owner_ins ON public.entregas;
    CREATE POLICY entregas_owner_ins ON public.entregas
      FOR INSERT TO authenticated
      WITH CHECK (
        public.auth_owns_store(store_id)
        AND EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = order_id AND o.store_id = entregas.store_id
        )
      );
  END IF;
END $$;

-- ─── admin_logs: sem acesso directo (só service role) ─────────────────────────
DO $$
BEGIN
  IF to_regclass('public.admin_logs') IS NOT NULL THEN
    ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.admin_logs FROM anon, authenticated;
  END IF;
END $$;

-- ─── admin_logs: colunas de auditoria ────────────────────────────────────────
ALTER TABLE public.admin_logs
  ADD COLUMN IF NOT EXISTS ip text,
  ADD COLUMN IF NOT EXISTS user_agent text;

-- ─── RPC: loja pública por slug (sem segredos) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_public_store_by_slug(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seg text := trim(coalesce(p_slug, ''));
  row public.stores%ROWTYPE;
BEGIN
  IF seg = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO row
  FROM public.stores s
  WHERE lower(trim(s.slug)) = lower(seg)
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO row
    FROM public.stores s
    WHERE s.slug ILIKE seg
    LIMIT 1;
  END IF;

  IF NOT FOUND OR NOT public.store_is_public_active(row.id) THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_strip_nulls(to_jsonb(row))
    - 'owner_id'
    - 'print_agent_token'
    - 'print_agent_url'
    - 'print_printer_ip'
    - 'print_printer_port'
    - 'print_auto_delivery'
    - 'print_auto_autoatendimento'
    - 'print_auto_pdv'
    - 'print_auto_garcom'
    - 'print_include_customer_details'
    - 'print_delivery_copy'
    - 'print_paper_mm'
    - 'hub_pin_balcao'
    - 'hub_pin_salao'
    - 'hub_pin_cozinha'
    - 'hub_pin_admin';
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_store_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_store_by_slug(text) TO anon, authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');
