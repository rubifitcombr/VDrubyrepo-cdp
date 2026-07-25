-- Configurações (/dashboard/settings): colunas em stores, RLS do owner e fiscal.
-- Idempotente — aplicar no SQL Editor do Supabase se a janela Configurações falhar ao guardar.

-- ---------------------------------------------------------------------------
-- stores: dados do estabelecimento, PIX, localização, PINs do hub, horários
-- ---------------------------------------------------------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS operation_mode text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS subtitle text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS business_hours jsonb;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS manual_closed boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS operating_hours_note text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(12, 2);

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS delivery_free_above numeric(12, 2);

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS delivery_max_km numeric(8, 2);

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS store_geo_lat numeric(10, 7);

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS store_geo_lng numeric(10, 7);

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS location_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS location_lat double precision;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS location_lng double precision;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS location_address text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS location_label text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS pix_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS pix_key_type text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS pix_key text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS pix_receiver_name text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS pix_receiver_city text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS hub_pin_balcao_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS hub_pin_balcao text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS hub_pin_salao_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS hub_pin_salao text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS hub_pin_cozinha_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS hub_pin_cozinha text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS hub_pin_admin_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS hub_pin_admin text;

COMMENT ON COLUMN public.stores.operating_hours_note IS
  'Nota opcional exibida junto ao horário de funcionamento no cardápio público.';
COMMENT ON COLUMN public.stores.business_hours IS
  'Horário semanal JSON (Configurações / cardápio público aberto-fechado).';
COMMENT ON COLUMN public.stores.logo_url IS
  'Logo da loja (painel + cardápio público).';
COMMENT ON COLUMN public.stores.pix_enabled IS
  'Aceita PIX no checkout do cardápio (plano Pro).';

-- ---------------------------------------------------------------------------
-- stores: RLS para o lojista ler/atualizar a própria loja (updateStore no browser)
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

-- ---------------------------------------------------------------------------
-- store_fiscal_config (secção fiscal em /dashboard/fiscal e API /api/store/fiscal)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_fiscal_config (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'nao_configurado',
  ambiente text NOT NULL DEFAULT 'homologacao',
  brasilnfe_token text,
  csc_id text,
  csc_token text,
  regime_tributario text NOT NULL DEFAULT 'simples_nacional',
  crt integer,
  cnpj text,
  inscricao_estadual text,
  razao_social text,
  nome_fantasia text,
  endereco_logradouro text,
  endereco_numero text,
  endereco_bairro text,
  endereco_municipio text,
  endereco_municipio_ibge text,
  endereco_uf text,
  endereco_cep text,
  cert_id text,
  cert_status text NOT NULL DEFAULT 'nao_enviado',
  cert_cn text,
  cert_validade text,
  cert_updated_at timestamptz,
  sefaz_credenciado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'nao_configurado';

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS ambiente text NOT NULL DEFAULT 'homologacao';

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS brasilnfe_token text;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS csc_id text;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS csc_token text;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS regime_tributario text NOT NULL DEFAULT 'simples_nacional';

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS crt integer;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS cnpj text;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS inscricao_estadual text;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS razao_social text;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS nome_fantasia text;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS endereco_logradouro text;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS endereco_numero text;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS endereco_bairro text;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS endereco_municipio text;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS endereco_municipio_ibge text;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS endereco_uf text;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS endereco_cep text;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS cert_id text;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS cert_status text NOT NULL DEFAULT 'nao_enviado';

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS cert_cn text;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS cert_validade text;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS cert_updated_at timestamptz;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS sefaz_credenciado boolean NOT NULL DEFAULT false;

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.store_fiscal_config
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON TABLE public.store_fiscal_config IS
  'Configuração fiscal NFC-e por loja (painel Fiscal / Brasil NFe).';

ALTER TABLE public.store_fiscal_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_fiscal_config_owner_sel ON public.store_fiscal_config;
CREATE POLICY store_fiscal_config_owner_sel
  ON public.store_fiscal_config
  FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT id FROM public.stores WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS store_fiscal_config_owner_ins ON public.store_fiscal_config;
CREATE POLICY store_fiscal_config_owner_ins
  ON public.store_fiscal_config
  FOR INSERT
  TO authenticated
  WITH CHECK (public.store_owner_can_operate(store_id));

DROP POLICY IF EXISTS store_fiscal_config_owner_upd ON public.store_fiscal_config;
CREATE POLICY store_fiscal_config_owner_upd
  ON public.store_fiscal_config
  FOR UPDATE
  TO authenticated
  USING (public.store_owner_can_operate(store_id))
  WITH CHECK (public.store_owner_can_operate(store_id));

GRANT SELECT, INSERT, UPDATE ON public.store_fiscal_config TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
