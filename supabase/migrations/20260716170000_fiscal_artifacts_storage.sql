-- Persistência de artefatos NFC-e: XML, DANFE (PDF) e URL do QR Code SEFAZ.
-- Arquivos ficam em Storage privado; download só via API autenticada do lojista.

alter table fiscal_invoices
  add column if not exists xml_storage_path text,
  add column if not exists danfe_storage_path text,
  add column if not exists qr_code_url text;

comment on column fiscal_invoices.xml_storage_path is 'Path no bucket fiscal-invoices do XML autorizado.';
comment on column fiscal_invoices.danfe_storage_path is 'Path no bucket fiscal-invoices do DANFE/PDF.';
comment on column fiscal_invoices.qr_code_url is 'URL do QR Code NFC-e extraída do XML (infNFeSupl/qrCode).';
comment on column fiscal_invoices.nfe_url is 'URL de download do DANFE (API Vyria ou link legado).';
comment on column fiscal_invoices.xml_url is 'URL de download do XML (API Vyria ou link legado).';

-- Bucket privado: service-role faz upload; lojista baixa via /api/store/fiscal/arquivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fiscal-invoices',
  'fiscal-invoices',
  false,
  10485760, -- 10 MB
  array['application/pdf', 'application/xml', 'text/xml']::text[]
)
on conflict (id) do nothing;

select pg_notify('pgrst', 'reload schema');
