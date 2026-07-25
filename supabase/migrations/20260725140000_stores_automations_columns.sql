-- Colunas de automações em stores (aceite automático, notificação, fecho por horário).
-- Idempotente — aplicar no SQL Editor do Supabase se a página Automações falhar ao guardar.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS auto_accept_orders boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS auto_notify_new_order boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS auto_close_outside_hours boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stores.auto_accept_orders IS
  'Automação: novos pedidos passam a «Preparando» automaticamente.';
COMMENT ON COLUMN public.stores.auto_notify_new_order IS
  'Automação: som e push ao receber novo pedido.';
COMMENT ON COLUMN public.stores.auto_close_outside_hours IS
  'Automação: alinhar manual_closed ao horário de funcionamento (Pro/Growth).';

-- Owner já tem UPDATE na tabela stores (stores_owner_update); garantir grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
