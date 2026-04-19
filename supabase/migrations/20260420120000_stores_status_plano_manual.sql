-- Controlo de acesso manual: colunas status/plano na loja, remoção de legado Asaas/trial.

-- Remover colunas legadas se existirem
ALTER TABLE public.stores DROP COLUMN IF EXISTS trial_expira_em;
ALTER TABLE public.stores DROP COLUMN IF EXISTS trial_expires_at;
ALTER TABLE public.stores DROP COLUMN IF EXISTS asaas_customer_id;
ALTER TABLE public.stores DROP COLUMN IF EXISTS asaas_subscription_id;

-- merchant_status → status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = 'merchant_status'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.stores RENAME COLUMN merchant_status TO status;
  END IF;
END $$;

-- Garantir coluna status
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pendente';

ALTER TABLE public.stores
  ALTER COLUMN status SET DEFAULT 'pendente';

COMMENT ON COLUMN public.stores.status IS 'pendente | ativo | bloqueado | cancelado';

DROP INDEX IF EXISTS idx_stores_merchant_status;
CREATE INDEX IF NOT EXISTS idx_stores_status ON public.stores (status);

-- plan → plano (start | growth | pro | master)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = 'plan'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = 'plano'
  ) THEN
    ALTER TABLE public.stores RENAME COLUMN plan TO plano;
  END IF;
END $$;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS plano VARCHAR(20) NOT NULL DEFAULT 'start';

UPDATE public.stores SET plano = CASE lower(trim(plano::text))
  WHEN 'growth' THEN 'growth'
  WHEN 'pro' THEN 'pro'
  WHEN 'master' THEN 'master'
  WHEN 'start' THEN 'start'
  ELSE 'start'
END;

ALTER TABLE public.stores
  ALTER COLUMN plano SET NOT NULL;

ALTER TABLE public.stores
  ALTER COLUMN plano SET DEFAULT 'start';

COMMENT ON COLUMN public.stores.plano IS 'start | growth | pro | master';

-- plano_vence_em / plano_ativado_em já existem na migração anterior; garantir tipos
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS plano_vence_em DATE;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS plano_ativado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_stores_plano_vence ON public.stores (plano_vence_em);
