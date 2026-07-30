-- Colunas de resgate de fidelidade em pedidos (checkout público).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS loyalty_redeem_points integer NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS loyalty_discount_brl numeric(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.loyalty_redeem_points IS
  'Pontos de fidelidade resgatados neste pedido.';

COMMENT ON COLUMN public.orders.loyalty_discount_brl IS
  'Desconto em R$ aplicado via resgate de pontos.';

DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_loyalty_redeem_points_chk
    CHECK (loyalty_redeem_points >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_loyalty_discount_brl_chk
    CHECK (loyalty_discount_brl >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
