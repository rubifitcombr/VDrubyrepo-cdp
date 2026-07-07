-- Aceite e assinatura electrónica do contrato anual (primeiro acesso após activar/renovar).

alter table stores
  add column if not exists contrato_aceite_em timestamptz,
  add column if not exists contrato_assinatura_nome text,
  add column if not exists contrato_assinatura_png text,
  add column if not exists contrato_termos_versao text,
  add column if not exists contrato_aceite_por uuid;

comment on column stores.contrato_aceite_em is 'Data/hora em que o lojista aceitou e assinou o contrato anual.';
comment on column stores.contrato_assinatura_nome is 'Nome completo informado na assinatura electrónica.';
comment on column stores.contrato_assinatura_png is 'Imagem PNG da assinatura (data URL ou base64).';
comment on column stores.contrato_termos_versao is 'Versão dos termos aceites no contrato anual.';
comment on column stores.contrato_aceite_por is 'Utilizador (auth) que assinou o contrato.';

select pg_notify('pgrst', 'reload schema');
