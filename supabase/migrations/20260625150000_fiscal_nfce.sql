-- Integração fiscal (NFC-e via Brasil NFe) — add-on ativado manualmente no painel admin.
-- O certificado A1 (.pfx) NÃO é armazenado aqui: fica na plataforma da Brasil NFe.
-- Guardamos apenas o Token (segredo) por loja e, se necessário, o CSC do QR da NFC-e.

-- 1) Configuração fiscal por lojista -------------------------------------------------
create table if not exists store_fiscal_config (
  store_id uuid primary key references stores(id) on delete cascade,
  -- nao_configurado -> pending_review -> ativo / bloqueado
  status text not null default 'nao_configurado',
  ambiente text not null default 'homologacao', -- 'homologacao' | 'producao'
  brasilnfe_token text,                          -- segredo: só service-role/owner
  csc_id text,
  csc_token text,
  regime_tributario text default 'simples_nacional',
  crt smallint,                                  -- 1=Simples Nacional, 3=Regime Normal
  -- Dados do emitente (loja) exigidos pela NFC-e
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Histórico de emissões -----------------------------------------------------------
create table if not exists fiscal_invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  status text not null default 'pendente', -- pendente | autorizada | rejeitada | cancelada | erro
  ambiente text,
  modelo smallint default 65,              -- 65 = NFC-e
  chave_acesso text,
  protocolo text,
  nfe_url text,                            -- DANFE / QR
  xml_url text,
  motivo_rejeicao text,
  valor_total numeric(10, 2),
  raw jsonb,                               -- resposta crua da API (auditoria)
  created_at timestamptz not null default now(),
  emitida_em timestamptz
);

create index if not exists idx_fiscal_invoices_store on fiscal_invoices (store_id);
create index if not exists idx_fiscal_invoices_order on fiscal_invoices (order_id);
-- Impede duas notas AUTORIZADAS para o mesmo pedido (permite retentar após rejeição).
create unique index if not exists uq_fiscal_invoices_order_autorizada
  on fiscal_invoices (order_id)
  where status = 'autorizada';

-- 3) Dados fiscais por produto -------------------------------------------------------
alter table products add column if not exists ncm text;
alter table products add column if not exists cfop text;
alter table products add column if not exists cest text;
alter table products add column if not exists unidade text default 'UN';
alter table products add column if not exists origem text default '0';   -- 0 = nacional
alter table products add column if not exists cst_csosn text;

-- 4) RLS -----------------------------------------------------------------------------
-- Service-role (admin/emissão) ignora RLS. Estas políticas limitam o acesso do
-- lojista autenticado (browser) APENAS à própria loja.
alter table store_fiscal_config enable row level security;
alter table fiscal_invoices enable row level security;

drop policy if exists store_fiscal_config_owner_sel on store_fiscal_config;
create policy store_fiscal_config_owner_sel on store_fiscal_config
  for select using (
    store_id in (select id from stores where owner_id = auth.uid())
  );

drop policy if exists store_fiscal_config_owner_ins on store_fiscal_config;
create policy store_fiscal_config_owner_ins on store_fiscal_config
  for insert with check (
    store_id in (select id from stores where owner_id = auth.uid())
  );

drop policy if exists store_fiscal_config_owner_upd on store_fiscal_config;
create policy store_fiscal_config_owner_upd on store_fiscal_config
  for update using (
    store_id in (select id from stores where owner_id = auth.uid())
  ) with check (
    store_id in (select id from stores where owner_id = auth.uid())
  );

-- O lojista pode VER o histórico das próprias notas; a escrita é feita por service-role.
drop policy if exists fiscal_invoices_owner_sel on fiscal_invoices;
create policy fiscal_invoices_owner_sel on fiscal_invoices
  for select using (
    store_id in (select id from stores where owner_id = auth.uid())
  );
