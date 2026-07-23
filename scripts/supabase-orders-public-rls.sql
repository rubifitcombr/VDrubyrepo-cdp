-- Cole no SQL Editor do Supabase (Dashboard → SQL → New query → Run).
-- Corrige: "new row violates row-level security policy for table orders" no checkout público.
-- Equivalente a supabase/migrations/20260723120000_orders_public_checkout_rls.sql

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

CREATE OR REPLACE FUNCTION public.store_owner_can_operate(p_store_id uuid)
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
      AND s.owner_id = auth.uid()
      AND lower(trim(coalesce(nullif(s.status, ''), nullif(s.merchant_status::text, ''), 'pendente'))) = 'ativo'
      AND s.plano_vence_em IS NOT NULL
      AND (s.plano_vence_em::date IS NOT NULL)
      AND CURRENT_DATE <= s.plano_vence_em::date
      AND (
        lower(trim(coalesce(s.billing_cycle::text, 'monthly'))) <> 'annual'
        OR (
          s.contrato_aceite_em IS NOT NULL
          AND nullif(trim(coalesce(s.contrato_documento_hash, '')), '') IS NOT NULL
          AND trim(coalesce(s.contrato_termos_versao, '')) = '2026-07'
        )
      )
  );
$$;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

GRANT INSERT, UPDATE, DELETE ON public.orders TO anon, authenticated;
GRANT SELECT ON public.orders TO authenticated;

DROP POLICY IF EXISTS orders_public_insert ON public.orders;
CREATE POLICY orders_public_insert ON public.orders
  FOR INSERT TO anon, authenticated
  WITH CHECK (public.store_is_public_active(store_id));

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

DO $$
BEGIN
  IF to_regclass('public.order_items') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY';
    EXECUTE 'GRANT INSERT, DELETE ON public.order_items TO anon, authenticated';
    EXECUTE 'GRANT SELECT ON public.order_items TO authenticated';

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
  END IF;
END $$;

SELECT pg_notify('pgrst', 'reload schema');

-- Verificação (deve listar orders_public_insert):
-- SELECT policyname, roles, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'orders' AND cmd = 'INSERT';
