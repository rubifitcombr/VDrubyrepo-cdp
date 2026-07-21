-- Gates plano/status no RLS: lojista suspenso não muta dados operacionais;
-- owner não altera status/plano/contrato; cancelamento permitido em bloqueado.
-- Idempotente — aplicar após 20260718160000.

-- ─── Helpers ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.store_plan_tier(p_store_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(nullif(s.plano::text, ''), nullif(s.plan::text, ''), 'start'))) IN ('pro', 'master') THEN 2
    WHEN lower(trim(coalesce(nullif(s.plano::text, ''), nullif(s.plan::text, ''), 'start'))) = 'growth' THEN 1
    ELSE 0
  END
  FROM public.stores s
  WHERE s.id = p_store_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.store_plan_tier_at_least(p_store_id uuid, p_min_tier integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(public.store_plan_tier(p_store_id), 0) >= p_min_tier;
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
      AND trim(s.plano_vence_em::text) ~ '^\d{4}-\d{2}-\d{2}$'
      AND CURRENT_DATE <= trim(s.plano_vence_em::text)::date
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

CREATE OR REPLACE FUNCTION public.store_owner_can_request_cancel(p_store_id uuid)
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
      AND lower(trim(coalesce(nullif(s.status, ''), nullif(s.merchant_status::text, ''), 'pendente'))) IN ('ativo', 'bloqueado')
  );
$$;

-- ─── Trigger: colunas sensíveis em stores ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.protect_stores_owner_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS DISTINCT FROM OLD.owner_id THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.merchant_status IS DISTINCT FROM OLD.merchant_status
     OR NEW.plano IS DISTINCT FROM OLD.plano
     OR NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.plano_vence_em IS DISTINCT FROM OLD.plano_vence_em
     OR NEW.plano_atualizado_em IS DISTINCT FROM OLD.plano_atualizado_em
     OR NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle
     OR NEW.contrato_aceite_em IS DISTINCT FROM OLD.contrato_aceite_em
     OR NEW.contrato_assinatura_nome IS DISTINCT FROM OLD.contrato_assinatura_nome
     OR NEW.contrato_assinatura_png IS DISTINCT FROM OLD.contrato_assinatura_png
     OR NEW.contrato_termos_versao IS DISTINCT FROM OLD.contrato_termos_versao
     OR NEW.contrato_aceite_por IS DISTINCT FROM OLD.contrato_aceite_por
     OR NEW.contrato_documento_tipo IS DISTINCT FROM OLD.contrato_documento_tipo
     OR NEW.contrato_documento_numero IS DISTINCT FROM OLD.contrato_documento_numero
     OR NEW.contrato_representante_cargo IS DISTINCT FROM OLD.contrato_representante_cargo
     OR NEW.contrato_documento_hash IS DISTINCT FROM OLD.contrato_documento_hash
     OR NEW.contrato_pdf_path IS DISTINCT FROM OLD.contrato_pdf_path
     OR NEW.contrato_aceite_ip IS DISTINCT FROM OLD.contrato_aceite_ip
     OR NEW.contrato_aceite_user_agent IS DISTINCT FROM OLD.contrato_aceite_user_agent
     OR NEW.contrato_aceite_email IS DISTINCT FROM OLD.contrato_aceite_email
  THEN
    RAISE EXCEPTION 'stores_sensitive_columns_protected';
  END IF;

  IF NEW.cancelamento_solicitado IS DISTINCT FROM OLD.cancelamento_solicitado THEN
    IF NOT (
      coalesce(OLD.cancelamento_solicitado, false) IS DISTINCT FROM true
      AND NEW.cancelamento_solicitado IS TRUE
    ) THEN
      RAISE EXCEPTION 'stores_cancelamento_solicitado_protected';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_stores_owner_sensitive ON public.stores;
CREATE TRIGGER trg_protect_stores_owner_sensitive
  BEFORE UPDATE ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_stores_owner_sensitive_columns();

-- ─── products ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS products_owner_insert ON public.products;
CREATE POLICY products_owner_insert ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.store_owner_can_operate(store_id));

DROP POLICY IF EXISTS products_owner_update ON public.products;
CREATE POLICY products_owner_update ON public.products
  FOR UPDATE TO authenticated
  USING (public.store_owner_can_operate(store_id))
  WITH CHECK (public.store_owner_can_operate(store_id));

DROP POLICY IF EXISTS products_owner_delete ON public.products;
CREATE POLICY products_owner_delete ON public.products
  FOR DELETE TO authenticated
  USING (public.store_owner_can_operate(store_id));

-- ─── orders (Growth+) ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS orders_owner_insert ON public.orders;
CREATE POLICY orders_owner_insert ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS orders_owner_update ON public.orders;
CREATE POLICY orders_owner_update ON public.orders
  FOR UPDATE TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  )
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS orders_owner_delete ON public.orders;
CREATE POLICY orders_owner_delete ON public.orders
  FOR DELETE TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

-- ─── order_items ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.order_items') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS order_items_owner_all ON public.order_items';
    EXECUTE $p$
      CREATE POLICY order_items_owner_all ON public.order_items
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_id
              AND public.store_owner_can_operate(o.store_id)
              AND public.store_plan_tier_at_least(o.store_id, 1)
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_id
              AND public.store_owner_can_operate(o.store_id)
              AND public.store_plan_tier_at_least(o.store_id, 1)
          )
        )
    $p$;
  END IF;
END $$;

-- ─── categories / addons ─────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.categories') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS categories_owner_all ON public.categories';
    EXECUTE $p$
      CREATE POLICY categories_owner_all ON public.categories
        FOR ALL TO authenticated
        USING (public.store_owner_can_operate(store_id))
        WITH CHECK (public.store_owner_can_operate(store_id))
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.addon_groups') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS addon_groups_owner_all ON public.addon_groups';
    EXECUTE $p$
      CREATE POLICY addon_groups_owner_all ON public.addon_groups
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.products p
            WHERE p.id = product_id
              AND public.store_owner_can_operate(p.store_id)
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.products p
            WHERE p.id = product_id
              AND public.store_owner_can_operate(p.store_id)
          )
        )
    $p$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.addon_items') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS addon_items_owner_all ON public.addon_items';
    EXECUTE $p$
      CREATE POLICY addon_items_owner_all ON public.addon_items
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.addon_groups g
            JOIN public.products p ON p.id = g.product_id
            WHERE g.id = group_id
              AND public.store_owner_can_operate(p.store_id)
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1
            FROM public.addon_groups g
            JOIN public.products p ON p.id = g.product_id
            WHERE g.id = group_id
              AND public.store_owner_can_operate(p.store_id)
          )
        )
    $p$;
  END IF;
END $$;

-- ─── fiscal (owner writes só com loja operacional) ───────────────────────────

DO $$
BEGIN
  IF to_regclass('public.store_fiscal_config') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS store_fiscal_config_owner_ins ON public.store_fiscal_config';
    EXECUTE $p$
      CREATE POLICY store_fiscal_config_owner_ins ON public.store_fiscal_config
        FOR INSERT TO authenticated
        WITH CHECK (public.store_owner_can_operate(store_id))
    $p$;
    EXECUTE 'DROP POLICY IF EXISTS store_fiscal_config_owner_upd ON public.store_fiscal_config';
    EXECUTE $p$
      CREATE POLICY store_fiscal_config_owner_upd ON public.store_fiscal_config
        FOR UPDATE TO authenticated
        USING (public.store_owner_can_operate(store_id))
        WITH CHECK (public.store_owner_can_operate(store_id))
    $p$;
  END IF;
END $$;

-- ─── Tabelas operacionais (store_id) ─────────────────────────────────────────

DO $$
DECLARE
  tbl text;
  min_tier integer;
  tbls text[] := ARRAY[
    'store_entregadores',
    'entregas',
    'store_tables',
    'store_promotions',
    'store_push_subscriptions',
    'store_menu_import_usage',
    'store_marketing_ai_usage',
    'store_garcons',
    'caixas_turnos',
    'caixa_movimentacoes',
    'store_product_stock'
  ];
  tiers integer[] := ARRAY[1, 1, 1, 1, 0, 0, 1, 2, 2, 2, 2];
  i integer;
BEGIN
  FOR i IN 1 .. coalesce(array_length(tbls, 1), 0) LOOP
    tbl := tbls[i];
    min_tier := tiers[i];
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I_owner_ins ON public.%I', tbl, tbl);
      EXECUTE format(
        'CREATE POLICY %I_owner_ins ON public.%I FOR INSERT TO authenticated WITH CHECK (public.store_owner_can_operate(store_id) AND public.store_plan_tier_at_least(store_id, %s))',
        tbl, tbl, min_tier
      );
      EXECUTE format('DROP POLICY IF EXISTS %I_owner_upd ON public.%I', tbl, tbl);
      EXECUTE format(
        'CREATE POLICY %I_owner_upd ON public.%I FOR UPDATE TO authenticated USING (public.store_owner_can_operate(store_id) AND public.store_plan_tier_at_least(store_id, %s)) WITH CHECK (public.store_owner_can_operate(store_id) AND public.store_plan_tier_at_least(store_id, %s))',
        tbl, tbl, min_tier, min_tier
      );
      EXECUTE format('DROP POLICY IF EXISTS %I_owner_del ON public.%I', tbl, tbl);
      EXECUTE format(
        'CREATE POLICY %I_owner_del ON public.%I FOR DELETE TO authenticated USING (public.store_owner_can_operate(store_id) AND public.store_plan_tier_at_least(store_id, %s))',
        tbl, tbl, min_tier
      );
    END IF;
  END LOOP;
END $$;

-- assinatura_cancelamentos: INSERT mesmo com loja bloqueada (pedido de cancelamento)
DO $$
BEGIN
  IF to_regclass('public.assinatura_cancelamentos') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS assinatura_cancelamentos_owner_ins ON public.assinatura_cancelamentos';
    EXECUTE $p$
      CREATE POLICY assinatura_cancelamentos_owner_ins ON public.assinatura_cancelamentos
        FOR INSERT TO authenticated
        WITH CHECK (public.store_owner_can_request_cancel(store_id))
    $p$;
  END IF;
END $$;

SELECT pg_notify('pgrst', 'reload schema');
