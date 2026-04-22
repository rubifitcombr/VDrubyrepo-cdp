-- Apaga dados públicos do lojista quando o registo em auth.users é removido.
-- Executar no Supabase (SQL Editor como postgres ou via CLI `supabase db push`).
--
-- Ordem: filhos de pedidos → pedidos → extras de produtos → produtos/categorias
--         → tabelas satélite por store_id → loja → logs onde o user era admin
--         → usuarios (espelho do auth).
--
-- Nota: apagar um utilizador em Auth é irreversível e remove histórico de pedidos/cardápio
-- dessas lojas. Para GDPR / direito ao esquecimento costuma ser o desejado; para só
-- "desativar" a conta, evita DELETE em auth.users e usa bloqueio / status na loja.

CREATE OR REPLACE FUNCTION public.delete_user_tenant_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id AS sid FROM public.stores WHERE owner_id = OLD.id
  LOOP
    DELETE FROM public.order_items oi
    USING public.orders o
    WHERE oi.order_id = o.id
      AND o.store_id = r.sid;

    DELETE FROM public.orders
    WHERE store_id = r.sid;

    DELETE FROM public.addon_items ai
    USING public.addon_groups ag, public.products p
    WHERE ai.group_id = ag.id
      AND ag.product_id = p.id
      AND p.store_id = r.sid;

    DELETE FROM public.addon_groups ag
    USING public.products p
    WHERE ag.product_id = p.id
      AND p.store_id = r.sid;

    DELETE FROM public.store_product_stock
    WHERE store_id = r.sid;

    DELETE FROM public.store_marketing_ai_usage
    WHERE store_id = r.sid;

    DELETE FROM public.store_menu_import_usage
    WHERE store_id = r.sid;

    DELETE FROM public.whatsapp_automations
    WHERE store_id = r.sid;

    DELETE FROM public.store_promotions
    WHERE store_id = r.sid;

    DELETE FROM public.assinatura_cancelamentos
    WHERE store_id = r.sid;

    DELETE FROM public.faturas
    WHERE store_id = r.sid;

    DELETE FROM public.admin_logs
    WHERE lojista_id::text = r.sid::text;

    DELETE FROM public.products
    WHERE store_id = r.sid;

    DELETE FROM public.categories
    WHERE store_id = r.sid;

    DELETE FROM public.stores
    WHERE id = r.sid;
  END LOOP;

  DELETE FROM public.admin_logs
  WHERE admin_id::text = OLD.id::text;

  DELETE FROM public.usuarios
  WHERE id = OLD.id;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.delete_user_tenant_data() IS
  'Chamado após DELETE em auth.users: remove lojas do owner_id e dados ligados em public.';

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;

CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.delete_user_tenant_data();

REVOKE ALL ON FUNCTION public.delete_user_tenant_data() FROM PUBLIC;
