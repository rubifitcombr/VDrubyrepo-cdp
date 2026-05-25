-- Preços e promoções por canal (delivery vs presencial)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS delivery_price numeric,
  ADD COLUMN IF NOT EXISTS dine_in_price numeric,
  ADD COLUMN IF NOT EXISTS delivery_promotional_price numeric,
  ADD COLUMN IF NOT EXISTS delivery_promotion_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dine_in_promotional_price numeric,
  ADD COLUMN IF NOT EXISTS dine_in_promotion_active boolean DEFAULT false;
