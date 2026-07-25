-- Automações (/dashboard/automations): toggles em stores + dependências de horário/plano.
-- Idempotente — aplicar no SQL Editor do Supabase se a janela Automações falhar ao guardar.
-- RLS em stores: também 20260725190010_configuracoes_schema.sql se updateStore falhar por permissão.

-- ---------------------------------------------------------------------------
-- stores: automações de pedidos e loja
-- ---------------------------------------------------------------------------
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
  'Automação: alinhar manual_closed ao horário de funcionamento (Growth/Pro).';

-- ---------------------------------------------------------------------------
-- stores: coluna exigida por trigger de billing/admin ao fazer UPDATE
-- ---------------------------------------------------------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS plano_atualizado_em timestamptz;

COMMENT ON COLUMN public.stores.plano_atualizado_em IS
  'Última alteração de plano/vencimento (admin ou jobs de billing).';

-- ---------------------------------------------------------------------------
-- stores: dependências da automação «fechar fora de horário»
-- ---------------------------------------------------------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS manual_closed boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS business_hours jsonb;

-- ---------------------------------------------------------------------------
-- stores: lojista lê/atualiza toggles via updateStore (browser autenticado)
-- ---------------------------------------------------------------------------
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stores_owner_select ON public.stores;
CREATE POLICY stores_owner_select
  ON public.stores
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS stores_owner_insert ON public.stores;
CREATE POLICY stores_owner_insert
  ON public.stores
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS stores_owner_update ON public.stores;
CREATE POLICY stores_owner_update
  ON public.stores
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.stores TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
