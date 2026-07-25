-- Financeiro (Caixa › aba Financeiro + Relatórios): fornecedores e lançamentos.
-- Idempotente — aplicar no SQL Editor do Supabase se o Financeiro falhar ao carregar/gravar.
-- Turnos de caixa: também 20260725190007_caixa_schema.sql se a operação de caixa falhar.

-- ---------------------------------------------------------------------------
-- suppliers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  nome text NOT NULL,
  telefone text,
  email text,
  categoria text,
  cnpj text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS telefone text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS cnpj text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS observacao text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

COMMENT ON TABLE public.suppliers IS
  'Fornecedores da loja (módulo Financeiro no Caixa).';

CREATE INDEX IF NOT EXISTS idx_suppliers_store_nome
  ON public.suppliers (store_id, nome);

-- ---------------------------------------------------------------------------
-- financial_entries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  categoria text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  valor numeric(12, 2) NOT NULL DEFAULT 0,
  vencimento timestamptz,
  data_pagamento timestamptz,
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_entries ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.financial_entries ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE public.financial_entries ADD COLUMN IF NOT EXISTS supplier_id uuid;
ALTER TABLE public.financial_entries ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.financial_entries ADD COLUMN IF NOT EXISTS valor numeric(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.financial_entries ADD COLUMN IF NOT EXISTS vencimento timestamptz;
ALTER TABLE public.financial_entries ADD COLUMN IF NOT EXISTS data_pagamento timestamptz;
ALTER TABLE public.financial_entries ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente';
ALTER TABLE public.financial_entries ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_entries_tipo_check'
      AND conrelid = 'public.financial_entries'::regclass
  ) THEN
    ALTER TABLE public.financial_entries
      ADD CONSTRAINT financial_entries_tipo_check
      CHECK (tipo IN ('receita', 'despesa'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_entries_status_check'
      AND conrelid = 'public.financial_entries'::regclass
  ) THEN
    ALTER TABLE public.financial_entries
      ADD CONSTRAINT financial_entries_status_check
      CHECK (status IN ('pendente', 'pago'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'financial_entries_valor_check'
      AND conrelid = 'public.financial_entries'::regclass
  ) THEN
    ALTER TABLE public.financial_entries
      ADD CONSTRAINT financial_entries_valor_check
      CHECK (valor >= 0);
  END IF;
END $$;

COMMENT ON TABLE public.financial_entries IS
  'Lançamentos financeiros (receitas/despesas) no módulo Financeiro do Caixa.';

CREATE INDEX IF NOT EXISTS idx_financial_entries_store_created
  ON public.financial_entries (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_entries_store_status
  ON public.financial_entries (store_id, status, vencimento);

CREATE INDEX IF NOT EXISTS idx_financial_entries_supplier_pending
  ON public.financial_entries (store_id, supplier_id)
  WHERE tipo = 'despesa' AND status = 'pendente';

-- ---------------------------------------------------------------------------
-- RLS: suppliers (plano Pro — tier >= 2)
-- ---------------------------------------------------------------------------
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppliers_owner_sel ON public.suppliers;
DROP POLICY IF EXISTS suppliers_owner_ins ON public.suppliers;
DROP POLICY IF EXISTS suppliers_owner_upd ON public.suppliers;
DROP POLICY IF EXISTS suppliers_owner_del ON public.suppliers;

CREATE POLICY suppliers_owner_sel
  ON public.suppliers
  FOR SELECT
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

CREATE POLICY suppliers_owner_ins
  ON public.suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

CREATE POLICY suppliers_owner_upd
  ON public.suppliers
  FOR UPDATE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  )
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

CREATE POLICY suppliers_owner_del
  ON public.suppliers
  FOR DELETE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: financial_entries (plano Pro — tier >= 2)
-- ---------------------------------------------------------------------------
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_entries_owner_sel ON public.financial_entries;
DROP POLICY IF EXISTS financial_entries_owner_ins ON public.financial_entries;
DROP POLICY IF EXISTS financial_entries_owner_upd ON public.financial_entries;
DROP POLICY IF EXISTS financial_entries_owner_del ON public.financial_entries;

CREATE POLICY financial_entries_owner_sel
  ON public.financial_entries
  FOR SELECT
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

CREATE POLICY financial_entries_owner_ins
  ON public.financial_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

CREATE POLICY financial_entries_owner_upd
  ON public.financial_entries
  FOR UPDATE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  )
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

CREATE POLICY financial_entries_owner_del
  ON public.financial_entries
  FOR DELETE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_entries TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
