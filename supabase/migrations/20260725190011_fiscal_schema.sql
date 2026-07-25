-- Vyria Fiscal (/dashboard/fiscal): configuração NFC-e, histórico e dados fiscais de produtos.
-- Idempotente — aplicar no SQL Editor do Supabase se o módulo fiscal falhar.
-- Configuração básica da loja: também 20260725190010_configuracoes_schema.sql se stores/RLS falhar.

-- ---------------------------------------------------------------------------
-- store_fiscal_config (empresa, certificado, CSC, status do add-on)
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

ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'nao_configurado';
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS ambiente text NOT NULL DEFAULT 'homologacao';
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS brasilnfe_token text;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS csc_id text;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS csc_token text;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS regime_tributario text NOT NULL DEFAULT 'simples_nacional';
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS crt integer;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS cnpj text;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS inscricao_estadual text;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS razao_social text;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS nome_fantasia text;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS endereco_logradouro text;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS endereco_numero text;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS endereco_bairro text;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS endereco_municipio text;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS endereco_municipio_ibge text;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS endereco_uf text;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS endereco_cep text;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS cert_id text;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS cert_status text NOT NULL DEFAULT 'nao_enviado';
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS cert_cn text;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS cert_validade text;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS cert_updated_at timestamptz;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS sefaz_credenciado boolean NOT NULL DEFAULT false;
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.store_fiscal_config ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON TABLE public.store_fiscal_config IS
  'Configuração fiscal NFC-e por loja (Vyria Fiscal / Brasil NFe).';

ALTER TABLE public.store_fiscal_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_fiscal_config_owner_sel ON public.store_fiscal_config;
CREATE POLICY store_fiscal_config_owner_sel
  ON public.store_fiscal_config
  FOR SELECT
  TO authenticated
  USING (
    store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid())
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

-- ---------------------------------------------------------------------------
-- fiscal_invoices (histórico NFC-e por pedido)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pendente',
  ambiente text,
  modelo integer NOT NULL DEFAULT 65,
  chave_acesso text,
  protocolo text,
  nfe_url text,
  xml_url text,
  qr_code_url text,
  motivo_rejeicao text,
  motivo_cancelamento text,
  protocolo_cancelamento text,
  valor_total numeric(12, 2),
  raw jsonb,
  xml_storage_path text,
  danfe_storage_path text,
  emitida_em timestamptz,
  cancelada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS store_id uuid;
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS order_id uuid;
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente';
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS ambiente text;
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS modelo integer NOT NULL DEFAULT 65;
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS chave_acesso text;
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS protocolo text;
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS nfe_url text;
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS xml_url text;
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS qr_code_url text;
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS motivo_rejeicao text;
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS motivo_cancelamento text;
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS protocolo_cancelamento text;
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS valor_total numeric(12, 2);
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS raw jsonb;
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS xml_storage_path text;
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS danfe_storage_path text;
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS emitida_em timestamptz;
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS cancelada_em timestamptz;
ALTER TABLE public.fiscal_invoices ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

COMMENT ON TABLE public.fiscal_invoices IS
  'Histórico de NFC-e emitidas/canceladas (Vyria Fiscal).';

CREATE INDEX IF NOT EXISTS idx_fiscal_invoices_store
  ON public.fiscal_invoices (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fiscal_invoices_order
  ON public.fiscal_invoices (order_id)
  WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_invoices_order_autorizada
  ON public.fiscal_invoices (order_id)
  WHERE status = 'autorizada' AND order_id IS NOT NULL;

ALTER TABLE public.fiscal_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_invoices_owner_sel ON public.fiscal_invoices;
CREATE POLICY fiscal_invoices_owner_sel
  ON public.fiscal_invoices
  FOR SELECT
  TO authenticated
  USING (
    store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid())
  );

GRANT SELECT ON public.fiscal_invoices TO authenticated;

-- ---------------------------------------------------------------------------
-- products: NCM, CFOP e tributação por item (checklist + emissão NFC-e)
-- ---------------------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ncm text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cfop text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cest text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cst_csosn text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS origem text DEFAULT '0';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unidade text DEFAULT 'UN';

COMMENT ON COLUMN public.products.ncm IS 'NCM do produto para NFC-e.';
COMMENT ON COLUMN public.products.cfop IS 'CFOP do produto para NFC-e (ex.: 5102).';

SELECT pg_notify('pgrst', 'reload schema');
