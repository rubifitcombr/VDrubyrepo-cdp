-- Coluna usada pelo trigger protect_stores_owner_sensitive_columns e pelo painel admin.
-- Sem ela, UPDATE em stores (ex.: Automações) falha com: record "new" has no field "plano_atualizado_em".

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS plano_atualizado_em timestamptz;

COMMENT ON COLUMN public.stores.plano_atualizado_em IS
  'Última alteração de plano/vencimento (admin ou jobs de billing).';

SELECT pg_notify('pgrst', 'reload schema');
