-- Caixa: turnos, movimentações, pagamentos split e módulo Financeiro.
-- Idempotente — aplicar no SQL Editor do Supabase se a janela Caixa falhar.
-- Depende de pedidos (20260725190002).

-- ---------------------------------------------------------------------------
-- caixas_turnos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.caixas_turnos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  aberto_em timestamptz NOT NULL DEFAULT now(),
  fechado_em timestamptz,
  status text NOT NULL DEFAULT 'aberto',
  operador text NOT NULL DEFAULT 'operador',
  fundo_inicial numeric(12, 2) NOT NULL DEFAULT 0,
  total_dinheiro numeric(12, 2) NOT NULL DEFAULT 0,
  total_pix numeric(12, 2) NOT NULL DEFAULT 0,
  total_cartao numeric(12, 2) NOT NULL DEFAULT 0,
  total_credito numeric(12, 2) NOT NULL DEFAULT 0,
  total_geral numeric(12, 2) NOT NULL DEFAULT 0,
  total_informado_dinheiro numeric(12, 2),
  total_informado_pix numeric(12, 2),
  total_informado_cartao numeric(12, 2),
  total_informado_credito numeric(12, 2),
  pedidos_fechados_count integer NOT NULL DEFAULT 0,
  diferenca numeric(12, 2) NOT NULL DEFAULT 0,
  fundo_proximo_turno numeric(12, 2)
);

ALTER TABLE public.caixas_turnos
  ADD COLUMN IF NOT EXISTS aberto_em timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.caixas_turnos
  ADD COLUMN IF NOT EXISTS fechado_em timestamptz;

ALTER TABLE public.caixas_turnos
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aberto';

ALTER TABLE public.caixas_turnos
  ADD COLUMN IF NOT EXISTS operador text NOT NULL DEFAULT 'operador';

ALTER TABLE public.caixas_turnos
  ADD COLUMN IF NOT EXISTS fundo_inicial numeric(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.caixas_turnos
  ADD COLUMN IF NOT EXISTS total_dinheiro numeric(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.caixas_turnos
  ADD COLUMN IF NOT EXISTS total_pix numeric(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.caixas_turnos
  ADD COLUMN IF NOT EXISTS total_cartao numeric(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.caixas_turnos
  ADD COLUMN IF NOT EXISTS total_credito numeric(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.caixas_turnos
  ADD COLUMN IF NOT EXISTS total_geral numeric(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.caixas_turnos
  ADD COLUMN IF NOT EXISTS total_informado_dinheiro numeric(12, 2);

ALTER TABLE public.caixas_turnos
  ADD COLUMN IF NOT EXISTS total_informado_pix numeric(12, 2);

ALTER TABLE public.caixas_turnos
  ADD COLUMN IF NOT EXISTS total_informado_cartao numeric(12, 2);

ALTER TABLE public.caixas_turnos
  ADD COLUMN IF NOT EXISTS total_informado_credito numeric(12, 2);

ALTER TABLE public.caixas_turnos
  ADD COLUMN IF NOT EXISTS pedidos_fechados_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.caixas_turnos
  ADD COLUMN IF NOT EXISTS diferenca numeric(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.caixas_turnos
  ADD COLUMN IF NOT EXISTS fundo_proximo_turno numeric(12, 2);

COMMENT ON TABLE public.caixas_turnos IS
  'Turnos de caixa (abertura/fecho, totais por forma de pagamento).';

CREATE INDEX IF NOT EXISTS idx_caixas_turnos_store_status
  ON public.caixas_turnos (store_id, status, aberto_em DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_caixas_turnos_one_open_per_store
  ON public.caixas_turnos (store_id)
  WHERE status = 'aberto';

-- ---------------------------------------------------------------------------
-- caixa_movimentacoes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.caixa_movimentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  turno_id uuid NOT NULL REFERENCES public.caixas_turnos(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  valor numeric(12, 2) NOT NULL DEFAULT 0,
  descricao text,
  motivo text,
  operador text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.caixa_movimentacoes
  ADD COLUMN IF NOT EXISTS descricao text;

ALTER TABLE public.caixa_movimentacoes
  ADD COLUMN IF NOT EXISTS motivo text;

ALTER TABLE public.caixa_movimentacoes
  ADD COLUMN IF NOT EXISTS operador text;

ALTER TABLE public.caixa_movimentacoes
  ADD COLUMN IF NOT EXISTS criado_em timestamptz NOT NULL DEFAULT now();

COMMENT ON TABLE public.caixa_movimentacoes IS
  'Movimentações do caixa (suprimento, sangria, acerto com entregador).';

CREATE INDEX IF NOT EXISTS idx_caixa_movimentacoes_turno_criado
  ON public.caixa_movimentacoes (turno_id, criado_em);

CREATE INDEX IF NOT EXISTS idx_caixa_movimentacoes_store_criado
  ON public.caixa_movimentacoes (store_id, criado_em DESC);

-- ---------------------------------------------------------------------------
-- orders: vínculo com turno ao fechar comanda
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS caixa_turno_id uuid;

CREATE INDEX IF NOT EXISTS idx_orders_store_caixa_turno
  ON public.orders (store_id, caixa_turno_id)
  WHERE caixa_turno_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- order_payments (pagamento split no fecho)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  amount_brl numeric(12, 2) NOT NULL,
  caixa_turno_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS caixa_turno_id uuid;

CREATE INDEX IF NOT EXISTS idx_order_payments_store_order
  ON public.order_payments (store_id, order_id);

CREATE INDEX IF NOT EXISTS idx_order_payments_store_turno
  ON public.order_payments (store_id, caixa_turno_id)
  WHERE caixa_turno_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- suppliers (Financeiro no Caixa)
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

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS telefone text;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS categoria text;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS cnpj text;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS observacao text;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

COMMENT ON TABLE public.suppliers IS
  'Fornecedores da loja (módulo Financeiro no Caixa).';

CREATE INDEX IF NOT EXISTS idx_suppliers_store_nome
  ON public.suppliers (store_id, nome);

-- ---------------------------------------------------------------------------
-- financial_entries (Financeiro no Caixa)
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
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_entries_tipo_check CHECK (tipo IN ('receita', 'despesa')),
  CONSTRAINT financial_entries_status_check CHECK (status IN ('pendente', 'pago')),
  CONSTRAINT financial_entries_valor_check CHECK (valor >= 0)
);

ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS supplier_id uuid;

ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS vencimento timestamptz;

ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS data_pagamento timestamptz;

ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente';

ALTER TABLE public.financial_entries
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

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
-- RLS: caixas_turnos
-- ---------------------------------------------------------------------------
ALTER TABLE public.caixas_turnos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS caixas_turnos_owner_sel ON public.caixas_turnos;
CREATE POLICY caixas_turnos_owner_sel
  ON public.caixas_turnos
  FOR SELECT
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

DROP POLICY IF EXISTS caixas_turnos_owner_ins ON public.caixas_turnos;
CREATE POLICY caixas_turnos_owner_ins
  ON public.caixas_turnos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

DROP POLICY IF EXISTS caixas_turnos_owner_upd ON public.caixas_turnos;
CREATE POLICY caixas_turnos_owner_upd
  ON public.caixas_turnos
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

DROP POLICY IF EXISTS caixas_turnos_owner_del ON public.caixas_turnos;
CREATE POLICY caixas_turnos_owner_del
  ON public.caixas_turnos
  FOR DELETE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.caixas_turnos TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: caixa_movimentacoes
-- ---------------------------------------------------------------------------
ALTER TABLE public.caixa_movimentacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS caixa_movimentacoes_owner_sel ON public.caixa_movimentacoes;
CREATE POLICY caixa_movimentacoes_owner_sel
  ON public.caixa_movimentacoes
  FOR SELECT
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

DROP POLICY IF EXISTS caixa_movimentacoes_owner_ins ON public.caixa_movimentacoes;
CREATE POLICY caixa_movimentacoes_owner_ins
  ON public.caixa_movimentacoes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

DROP POLICY IF EXISTS caixa_movimentacoes_owner_upd ON public.caixa_movimentacoes;
CREATE POLICY caixa_movimentacoes_owner_upd
  ON public.caixa_movimentacoes
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

DROP POLICY IF EXISTS caixa_movimentacoes_owner_del ON public.caixa_movimentacoes;
CREATE POLICY caixa_movimentacoes_owner_del
  ON public.caixa_movimentacoes
  FOR DELETE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 2)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.caixa_movimentacoes TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: order_payments
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_payments_owner_select ON public.order_payments;
CREATE POLICY order_payments_owner_select
  ON public.order_payments
  FOR SELECT
  TO authenticated
  USING (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS order_payments_owner_insert ON public.order_payments;
CREATE POLICY order_payments_owner_insert
  ON public.order_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.auth_owns_store(store_id));

DROP POLICY IF EXISTS order_payments_owner_delete ON public.order_payments;
CREATE POLICY order_payments_owner_delete
  ON public.order_payments
  FOR DELETE
  TO authenticated
  USING (public.auth_owns_store(store_id));

GRANT SELECT, INSERT, DELETE ON public.order_payments TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: suppliers
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
-- RLS: financial_entries
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

-- ---------------------------------------------------------------------------
-- Realtime (Caixa + sync operacional)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'caixas_turnos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.caixas_turnos;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'caixa_movimentacoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.caixa_movimentacoes;
  END IF;
END $$;

SELECT pg_notify('pgrst', 'reload schema');
