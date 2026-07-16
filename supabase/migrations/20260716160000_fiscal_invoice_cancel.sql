-- Persistência do evento de cancelamento de NFC-e (segurança do lojista).
alter table fiscal_invoices
  add column if not exists cancelada_em timestamptz,
  add column if not exists motivo_cancelamento text,
  add column if not exists protocolo_cancelamento text;

comment on column fiscal_invoices.cancelada_em is 'Momento em que o cancelamento foi confirmado/gravado.';
comment on column fiscal_invoices.motivo_cancelamento is 'Justificativa enviada à SEFAZ (mín. 15 caracteres).';
comment on column fiscal_invoices.protocolo_cancelamento is 'Protocolo do evento de cancelamento retornado pelo gateway.';
