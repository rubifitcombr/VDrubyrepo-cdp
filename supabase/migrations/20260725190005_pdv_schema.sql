-- PDV: vendas no balcão, turno de caixa e pagamentos imediatos.
-- Idempotente — aplicar no SQL Editor do Supabase se a janela PDV falhar.
-- Depende de produtos (20260725190001) e pedidos (20260725190002).

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
-- caixa_movimentacoes (suprimento, sangria, acerto entregador)
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
  'Movimentações do caixa no turno (suprimento, sangria, acerto com entregador).';

CREATE INDEX IF NOT EXISTS idx_caixa_movimentacoes_turno_criado
  ON public.caixa_movimentacoes (turno_id, criado_em);

CREATE INDEX IF NOT EXISTS idx_caixa_movimentacoes_store_criado
  ON public.caixa_movimentacoes (store_id, criado_em DESC);

-- ---------------------------------------------------------------------------
-- orders: vínculo com turno (PDV «receber agora» e fecho no Caixa)
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS caixa_turno_id uuid;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source text;

CREATE INDEX IF NOT EXISTS idx_orders_store_source_created
  ON public.orders (store_id, source, created_at DESC)
  WHERE source IN ('pdv', 'waiter', 'autoatendimento');

CREATE INDEX IF NOT EXISTS idx_orders_store_caixa_turno
  ON public.orders (store_id, caixa_turno_id)
  WHERE caixa_turno_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS: caixas_turnos (módulo Caixa / PDV receber agora — Pro)
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

SELECT pg_notify('pgrst', 'reload schema');
