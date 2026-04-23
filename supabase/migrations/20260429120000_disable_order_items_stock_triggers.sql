-- PDV / checkout: remove triggers em public.order_items que bloqueiam inserts com
-- "Estoque insuficiente" quando o módulo de stock já não é usado (legado phase3b).

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT t.tgname AS tgname
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE n.nspname = 'public'
      AND c.relname = 'order_items'
      AND NOT t.tgisinternal
      AND (
        lower(p.proname) LIKE '%stock%'
        OR lower(p.proname) LIKE '%estoque%'
        OR lower(p.proname) LIKE '%inventory%'
        OR lower(p.proname) LIKE '%decrement%'
        OR lower(t.tgname) LIKE '%stock%'
        OR lower(t.tgname) LIKE '%estoque%'
        OR lower(t.tgname) LIKE '%inventory%'
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.order_items', r.tgname);
  END LOOP;
END $$;

-- Nomes comuns em scripts antigos (idempotente; ignora se não existir)
DROP TRIGGER IF EXISTS on_order_item_insert_decrement_stock ON public.order_items;
DROP TRIGGER IF EXISTS trg_order_items_stock ON public.order_items;
DROP TRIGGER IF EXISTS trg_order_items_decrement_stock ON public.order_items;
DROP TRIGGER IF EXISTS order_items_stock_trigger ON public.order_items;
DROP TRIGGER IF EXISTS handle_order_items_stock ON public.order_items;

-- Se o erro continuar, lista triggers ainda ligados a order_items:
-- SELECT t.tgname, p.proname
-- FROM pg_trigger t
-- JOIN pg_class c ON t.tgrelid = c.oid
-- JOIN pg_namespace n ON c.relnamespace = n.oid
-- JOIN pg_proc p ON t.tgfoid = p.oid
-- WHERE n.nspname = 'public' AND c.relname = 'order_items' AND NOT t.tgisinternal;
