-- Impressão (/dashboard/printing): agente térmico, impressora e toggles em stores.
-- Idempotente — aplicar no SQL Editor do Supabase se a janela Impressão falhar ao guardar.
-- RLS em stores: também 20260725190010_configuracoes_schema.sql se updateStore falhar por permissão.

-- ---------------------------------------------------------------------------
-- stores: cupom no navegador e opções do recibo
-- ---------------------------------------------------------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS print_auto_on_confirm boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS print_include_customer_details boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS print_delivery_copy boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS print_paper_mm integer;

-- ---------------------------------------------------------------------------
-- stores: agente local (Vyria Print Agent) + impressora ESC/POS na rede
-- ---------------------------------------------------------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS print_agent_url text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS print_agent_token text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS print_printer_ip text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS print_printer_port integer;

-- ---------------------------------------------------------------------------
-- stores: impressão automática por canal
-- ---------------------------------------------------------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS print_auto_delivery boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS print_auto_autoatendimento boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS print_auto_pdv boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS print_auto_garcom boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stores.print_auto_on_confirm IS
  'Abre cupom no navegador quando o pedido passa a «A preparar».';
COMMENT ON COLUMN public.stores.print_agent_url IS
  'URL base do Vyria Print Agent (ex.: http://127.0.0.1:3310).';
COMMENT ON COLUMN public.stores.print_printer_ip IS
  'IP da impressora térmica na rede local (porta RAW, normalmente 9100).';
COMMENT ON COLUMN public.stores.print_auto_delivery IS
  'Impressão térmica automática em pedidos online (delivery/retirada).';

-- ---------------------------------------------------------------------------
-- stores: lojista atualiza configuração via updateStore (browser autenticado)
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
