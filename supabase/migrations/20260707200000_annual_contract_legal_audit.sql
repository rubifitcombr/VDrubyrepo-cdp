-- Prova judicial do contrato anual: auditoria imutável, storage e campos extra em stores.

alter table stores add column if not exists contrato_documento_tipo text;
alter table stores add column if not exists contrato_documento_numero text;
alter table stores add column if not exists contrato_representante_cargo text;
alter table stores add column if not exists contrato_documento_hash text;
alter table stores add column if not exists contrato_pdf_path text;
alter table stores add column if not exists contrato_aceite_ip text;
alter table stores add column if not exists contrato_aceite_user_agent text;
alter table stores add column if not exists contrato_aceite_email text;

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

-- Bucket privado para PDFs (service role faz upload; download via API autenticada).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contratos',
  'contratos',
  false,
  5242880,
  array['application/pdf']::text[]
)
on conflict (id) do nothing;

select pg_notify('pgrst', 'reload schema');
