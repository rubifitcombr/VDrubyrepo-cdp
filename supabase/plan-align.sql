-- Alinhar `public.stores.plan` à matriz do Vyria (lib/plan.ts):
--   START | GROWTH | PRO | MASTER
--
-- Executar no SQL Editor do Supabase após rever o tipo da coluna (text vs enum).
-- Faz backup ou testa primeiro num projeto de staging.

-- ---------------------------------------------------------------------------
-- A) Coluna `plan` como TEXT ou VARCHAR (recomendado / mais simples)
-- ---------------------------------------------------------------------------

UPDATE public.stores
SET plan = CASE lower(trim(coalesce(plan::text, '')))
  WHEN '' THEN 'START'
  WHEN 'start' THEN 'START'
  WHEN 'growth' THEN 'GROWTH'
  WHEN 'pro' THEN 'PRO'
  WHEN 'master' THEN 'MASTER'
  ELSE 'START'
END;

-- Opcional: nunca deixar NULL (o app trata como START, mas o dado fica explícito)
-- UPDATE public.stores SET plan = 'START' WHERE plan IS NULL;

-- Opcional: garantir só valores válidos (falha se ainda existir lixo; corre o UPDATE acima antes)
-- ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_plan_check;
-- ALTER TABLE public.stores
--   ADD CONSTRAINT stores_plan_check
--   CHECK (plan IS NULL OR plan IN ('START', 'GROWTH', 'PRO', 'MASTER'));

-- ---------------------------------------------------------------------------
-- B) Se `plan` for um tipo ENUM PostgreSQL só com start / growth / pro
-- ---------------------------------------------------------------------------
-- 1) Adiciona o valor MASTER (repetir se já existir pode dar erro — ignora nesse caso):
--    ALTER TYPE nome_do_teu_enum ADD VALUE 'MASTER';
--    (Em PG antigo não há IF NOT EXISTS; em PG 15+ podes usar ADD VALUE IF NOT EXISTS.)
--
-- 2) Normalizar maiúsculas: se o enum for só em minúsculas, mapeia assim:
--    UPDATE public.stores SET plan = 'master'::nome_do_teu_enum WHERE plan::text = 'master';
--    -- e adiciona valores novos ao tipo se quiseres START em maiúsculas:
--    -- ALTER TYPE nome_do_teu_enum ADD VALUE 'START';
--    -- UPDATE public.stores SET plan = 'START'::nome_do_teu_enum WHERE plan::text = 'start';
--
-- Alternativa limpa: migrar coluna para text
--    ALTER TABLE public.stores ADD COLUMN plan_new text;
--    UPDATE public.stores SET plan_new = upper(plan::text);
--    ALTER TABLE public.stores DROP COLUMN plan;
--    ALTER TABLE public.stores RENAME COLUMN plan_new TO plan;
--    depois corre o bloco A (UPDATE) e o CHECK se quiseres.
