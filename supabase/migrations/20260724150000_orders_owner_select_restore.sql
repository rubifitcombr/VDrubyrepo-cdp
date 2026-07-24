-- Restaura leitura de pedidos pelo lojista autenticado.
-- Sem esta policy, INSERT com RETURNING (.select após .insert) falha com
-- "new row violates row-level security policy for table orders" no garçom/PDV.
-- Idempotente.

DROP POLICY IF EXISTS orders_owner_select ON public.orders;
CREATE POLICY orders_owner_select ON public.orders
  FOR SELECT TO authenticated
  USING (public.auth_owns_store(store_id));

SELECT pg_notify('pgrst', 'reload schema');
