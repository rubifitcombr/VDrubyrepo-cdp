-- Aplicar manualmente se a migration automática ainda não correu.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS addons jsonb;

COMMENT ON COLUMN public.order_items.addons IS
  'Seleção de adicionais por linha: [{ groupName, itemName, price, quantity }].';
