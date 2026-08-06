-- Itens baixos das auditorias: cupom no checkout, política NFC-e, mesa estruturada.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS salon_table_id uuid REFERENCES public.store_tables(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS salon_table_sector text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promo_coupon_code text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promo_discount_brl numeric(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.salon_table_id IS
  'Mesa do salão (FK store_tables) — complementa orders.notes.';

COMMENT ON COLUMN public.orders.promo_coupon_code IS
  'Código de cupom aplicado no checkout público.';

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS nfce_block_close_on_failure boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.store_fiscal_config.nfce_block_close_on_failure IS
  'Quando true, falha na NFC-e automática reverte o fecho da comanda no caixa.';

CREATE TABLE IF NOT EXISTS public.store_promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  promotion_id uuid NOT NULL REFERENCES public.store_promotions(id) ON DELETE CASCADE,
  coupon_code text NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_promo_redemptions_store_coupon
  ON public.store_promo_redemptions (store_id, coupon_code);

ALTER TABLE public.store_promo_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_promo_redemptions_owner ON public.store_promo_redemptions;
CREATE POLICY store_promo_redemptions_owner ON public.store_promo_redemptions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_promo_redemptions.store_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_promo_redemptions.store_id AND s.owner_id = auth.uid()
    )
  );

GRANT SELECT, INSERT ON public.store_promo_redemptions TO authenticated;
