-- Endurecimento pós-ataque: remove acesso directo anon às tabelas orders/order_items.
-- Checkout público passa pelo backend (service role) e RPCs SECURITY DEFINER.
-- Idempotente.

-- ---------------------------------------------------------------------------
-- orders: remover políticas públicas amplas (SELECT/UPDATE/DELETE/INSERT anon)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS orders_public_select_recent ON public.orders;
DROP POLICY IF EXISTS orders_public_update_checkout ON public.orders;
DROP POLICY IF EXISTS orders_public_delete_recent ON public.orders;
DROP POLICY IF EXISTS orders_public_insert ON public.orders;

REVOKE ALL ON public.orders FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;

-- ---------------------------------------------------------------------------
-- order_items: sem acesso anon directo
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS order_items_public_insert ON public.order_items;
DROP POLICY IF EXISTS order_items_public_delete ON public.order_items;

REVOKE ALL ON public.order_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;

-- ---------------------------------------------------------------------------
-- Trigger: bloqueia alterações sensíveis em orders por sessão não autenticada
-- (defesa em profundidade se alguma policy anon for reintroduzida por engano)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orders_block_anon_sensitive_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') = 'anon' THEN
    RAISE EXCEPTION 'Operação não permitida para cliente anónimo.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_block_anon_sensitive_update_trg ON public.orders;
CREATE TRIGGER orders_block_anon_sensitive_update_trg
  BEFORE UPDATE OR DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_block_anon_sensitive_update();

DROP TRIGGER IF EXISTS orders_block_anon_insert_trg ON public.orders;
CREATE TRIGGER orders_block_anon_insert_trg
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_block_anon_sensitive_update();

SELECT pg_notify('pgrst', 'reload schema');
