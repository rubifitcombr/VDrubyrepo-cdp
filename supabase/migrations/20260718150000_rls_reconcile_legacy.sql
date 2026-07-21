-- Reconcilia policies LEGADAS com o modelo seguro (20260718120000).
-- Correr DEPOIS de 20260718120000 se já a aplicaste, ou antes + voltar a correr 20260718120000.
-- Idempotente.

-- ═══ 1) Remover policies antigas (nomes do audit pré-migração) ═══════════════

-- stores — anon NÃO pode SELECT directo (usar RPC get_public_store_by_slug)
DROP POLICY IF EXISTS "User owns store" ON public.stores;
DROP POLICY IF EXISTS "Allow owner update store" ON public.stores;
DROP POLICY IF EXISTS vyria_stores_public_select_anon ON public.stores;
DROP POLICY IF EXISTS vyria_stores_public_select_authenticated ON public.stores;
DROP POLICY IF EXISTS vyria_stores_owner_select ON public.stores;
DROP POLICY IF EXISTS vyria_stores_owner_insert ON public.stores;
DROP POLICY IF EXISTS vyria_stores_owner_update ON public.stores;
DROP POLICY IF EXISTS vyria_stores_owner_delete ON public.stores;

-- core tenant (políticas genéricas antigas)
DROP POLICY IF EXISTS "Access own orders" ON public.orders;
DROP POLICY IF EXISTS "Access own products" ON public.products;
DROP POLICY IF EXISTS "Access own order items" ON public.order_items;

-- addons (nomes alternativos)
DROP POLICY IF EXISTS addon_groups_select_public_active_product ON public.addon_groups;
DROP POLICY IF EXISTS addon_items_select_public_active_product ON public.addon_items;

-- assinatura / quotas / stock (nomes antigos)
DROP POLICY IF EXISTS assinatura_cancel_insert_lojista ON public.assinatura_cancelamentos;
DROP POLICY IF EXISTS assinatura_cancel_select_lojista ON public.assinatura_cancelamentos;
DROP POLICY IF EXISTS store_marketing_ai_usage_rw ON public.store_marketing_ai_usage;
DROP POLICY IF EXISTS store_menu_import_usage_modify ON public.store_menu_import_usage;
DROP POLICY IF EXISTS store_menu_import_usage_select ON public.store_menu_import_usage;
DROP POLICY IF EXISTS store_product_stock_write ON public.store_product_stock;
DROP POLICY IF EXISTS store_product_stock_select ON public.store_product_stock;
DROP POLICY IF EXISTS faturas_select_lojista ON public.faturas;

-- store_garcons_*_owner do script manual — manter (já isolam por owner).

-- ═══ 2) Garantir grants stores (anon bloqueado) ══════════════════════════════

REVOKE ALL ON public.stores FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;

-- ═══ 3) Re-aplicar policies críticas (checkout público + owner) ═════════════
-- Requer funções: store_is_public_active, auth_owns_store (migration 20260718120000)

-- stores (só owner autenticado)
DROP POLICY IF EXISTS stores_owner_select ON public.stores;
CREATE POLICY stores_owner_select ON public.stores
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS stores_owner_insert ON public.stores;
CREATE POLICY stores_owner_insert ON public.stores
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS stores_owner_update ON public.stores;
CREATE POLICY stores_owner_update ON public.stores
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS stores_owner_delete ON public.stores;
CREATE POLICY stores_owner_delete ON public.stores
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- products
DROP POLICY IF EXISTS products_public_select ON public.products;
CREATE POLICY products_public_select ON public.products
  FOR SELECT TO anon, authenticated
  USING (active IS TRUE AND public.store_is_public_active(store_id));

DROP POLICY IF EXISTS products_owner_select ON public.products;
CREATE POLICY products_owner_select ON public.products
  FOR SELECT TO authenticated USING (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS products_owner_insert ON public.products;
CREATE POLICY products_owner_insert ON public.products
  FOR INSERT TO authenticated WITH CHECK (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS products_owner_update ON public.products;
CREATE POLICY products_owner_update ON public.products
  FOR UPDATE TO authenticated
  USING (public.auth_owns_store(store_id)) WITH CHECK (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS products_owner_delete ON public.products;
CREATE POLICY products_owner_delete ON public.products
  FOR DELETE TO authenticated USING (public.auth_owns_store(store_id));

-- orders (checkout + owner)
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
  FOR SELECT TO authenticated USING (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS orders_owner_insert ON public.orders;
CREATE POLICY orders_owner_insert ON public.orders
  FOR INSERT TO authenticated WITH CHECK (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS orders_owner_update ON public.orders;
CREATE POLICY orders_owner_update ON public.orders
  FOR UPDATE TO authenticated
  USING (public.auth_owns_store(store_id)) WITH CHECK (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS orders_owner_delete ON public.orders;
CREATE POLICY orders_owner_delete ON public.orders
  FOR DELETE TO authenticated USING (public.auth_owns_store(store_id));

-- order_items
DO $$
BEGIN
  IF to_regclass('public.order_items') IS NOT NULL THEN
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

SELECT pg_notify('pgrst', 'reload schema');
