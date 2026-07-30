-- Data da primeira activação / reactivação do plano (painel admin).
-- Sem esta coluna, POST /api/admin/lojistas/[id]/ativar falha ao activar lojistas.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS plano_ativado_em timestamptz;

COMMENT ON COLUMN public.stores.plano_ativado_em IS
  'Data/hora em que o plano foi activado ou a conta foi reactivada pelo admin.';

SELECT pg_notify('pgrst', 'reload schema');
