-- ═══════════════════════════════════════════════════════════════════════════
-- AUDITORIA RLS — colar APENAS isto no SQL Editor do Supabase (não é Node).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Quais tabelas têm RLS activa?
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY rowsecurity ASC, tablename;

-- 2) Tabelas com RLS ON mas SEM nenhuma policy (bloqueio total para anon/auth)
SELECT t.tablename
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND t.rowsecurity = true
  AND NOT EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = t.tablename
  );

-- 3) Todas as policies (esperado após 20260718160000_orders_rls_tighten_pix.sql):
--    - stores: stores_owner_* (4x) — SEM vyria_stores_public_select_anon
--    - products: products_public_select + products_owner_* (4x)
--    - orders: orders_public_insert/update/delete + orders_owner_* — SEM orders_public_select_pix
--    - order_items: order_items_public_* + order_items_owner_all
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

-- 4) Confirmar que anon NÃO tem SELECT em stores (leitura pública = RPC)
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'stores'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;

-- 5) RPCs públicas existem?
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_public_store_by_slug',
    'get_public_pix_order_status',
    'report_customer_pix_payment'
  );

-- 6) Confirmar helpers de gate merchant (após 20260718170000)
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'store_owner_can_operate',
    'store_owner_can_request_cancel',
    'store_plan_tier',
    'store_plan_tier_at_least',
    'protect_stores_owner_sensitive_columns'
  )
ORDER BY routine_name;

-- 7) Trigger de proteção em stores
SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'public.stores'::regclass
  AND tgname = 'trg_protect_stores_owner_sensitive';
