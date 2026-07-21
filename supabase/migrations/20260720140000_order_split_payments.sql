-- Pagamentos parciais por comanda (ex.: parte dinheiro + parte PIX).
-- Idempotente — aplicar no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS public.order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_method text NOT NULL CHECK (
    payment_method IN ('cash', 'pix', 'card', 'card_credit', 'card_debit')
  ),
  amount_brl numeric(12, 2) NOT NULL CHECK (amount_brl > 0),
  caixa_turno_id uuid REFERENCES public.caixas_turnos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_payments_order
  ON public.order_payments (order_id);

CREATE INDEX IF NOT EXISTS idx_order_payments_store_turno
  ON public.order_payments (store_id, caixa_turno_id);

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_payments_owner_select ON public.order_payments;
CREATE POLICY order_payments_owner_select ON public.order_payments
  FOR SELECT TO authenticated
  USING (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS order_payments_owner_insert ON public.order_payments;
CREATE POLICY order_payments_owner_insert ON public.order_payments
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS order_payments_owner_delete ON public.order_payments;
CREATE POLICY order_payments_owner_delete ON public.order_payments
  FOR DELETE TO authenticated
  USING (public.auth_owns_store(store_id));

REVOKE ALL ON public.order_payments FROM anon;
GRANT SELECT, INSERT, DELETE ON public.order_payments TO authenticated;
