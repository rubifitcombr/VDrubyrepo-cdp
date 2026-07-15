-- Onboarding fiscal: status intermediário e confirmação de credenciamento SEFAZ.

alter table store_fiscal_config
  add column if not exists sefaz_credenciado boolean not null default false;

comment on column store_fiscal_config.sefaz_credenciado is
  'Lojista confirmou possuir credenciamento NFC-e na SEFAZ (obtido manualmente).';

-- Lojas que já estavam em pending_review antes do onboarding continuam aguardando admin.
-- Novas configurações passam por aguardando_configuracao até solicitar ativação.
