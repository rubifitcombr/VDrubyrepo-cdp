-- Contrato anual Vyria Delivery (executar uma vez no Supabase → SQL Editor).
-- Idempotente: pode correr de novo sem erro se as colunas já existirem.
-- Depois de executar, o PostgREST recarrega o schema automaticamente (ou aguarda ~1 min).

-- ─── stores: ciclo e contrato comercial ─────────────────────────────────────
alter table stores add column if not exists billing_cycle text;
update stores set billing_cycle = 'monthly' where billing_cycle is null;
alter table stores alter column billing_cycle set default 'monthly';
alter table stores alter column billing_cycle set not null;

alter table stores add column if not exists contrato_inicio_em date;
alter table stores add column if not exists contrato_fim_em date;
alter table stores add column if not exists contrato_mensal_brl numeric;
alter table stores add column if not exists contrato_desconto_pct numeric;

alter table stores add column if not exists contrato_aceite_em timestamptz;
alter table stores add column if not exists contrato_assinatura_nome text;
alter table stores add column if not exists contrato_assinatura_png text;
alter table stores add column if not exists contrato_termos_versao text;
alter table stores add column if not exists contrato_aceite_por uuid;

alter table stores add column if not exists contrato_documento_tipo text;
alter table stores add column if not exists contrato_documento_numero text;
alter table stores add column if not exists contrato_representante_cargo text;
alter table stores add column if not exists contrato_documento_hash text;
alter table stores add column if not exists contrato_pdf_path text;
alter table stores add column if not exists contrato_aceite_ip text;
alter table stores add column if not exists contrato_aceite_user_agent text;
alter table stores add column if not exists contrato_aceite_email text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stores_billing_cycle_check'
  ) then
    alter table stores
      add constraint stores_billing_cycle_check
      check (billing_cycle in ('monthly', 'annual'));
  end if;
end $$;

-- ─── assinatura_cancelamentos: multa no pedido de cancelamento ─────────────
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'assinatura_cancelamentos'
  ) then
    alter table assinatura_cancelamentos
      add column if not exists multa_estimada_brl numeric;
    alter table assinatura_cancelamentos
      add column if not exists meses_restantes integer;
  end if;
end $$;

-- ─── Auditoria imutável + bucket de PDFs ────────────────────────────────────
create table if not exists contrato_aceites (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  termos_versao text not null,
  documento_hash text not null,
  assinatura_nome text not null,
  documento_tipo text not null check (documento_tipo in ('cpf', 'cnpj')),
  documento_numero text not null,
  representante_cargo text not null,
  aceite_representante_legal boolean not null default true,
  aceite_termos boolean not null default true,
  aceite_compromisso_12m boolean not null default true,
  ip_address text,
  user_agent text,
  user_id uuid,
  user_email text,
  pdf_storage_path text,
  contrato_inicio_em date,
  contrato_fim_em date,
  mensal_brl numeric,
  documento_canonico jsonb not null,
  criado_em timestamptz not null default now()
);

create index if not exists contrato_aceites_store_id_idx on contrato_aceites(store_id);
create index if not exists contrato_aceites_documento_hash_idx on contrato_aceites(documento_hash);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contratos',
  'contratos',
  false,
  5242880,
  array['application/pdf']::text[]
)
on conflict (id) do nothing;

-- Recarregar cache do PostgREST (API Supabase)
select pg_notify('pgrst', 'reload schema');
