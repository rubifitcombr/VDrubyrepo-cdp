-- Entregadores: cadastro, entregas, acertos com caixa e painel operacional.
-- Idempotente — aplicar no SQL Editor do Supabase se a janela Entregadores falhar.

-- ---------------------------------------------------------------------------
-- store_entregadores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_entregadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  nome text NOT NULL,
  telefone text,
  tipo text NOT NULL DEFAULT 'fixo',
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  status_operacional text NOT NULL DEFAULT 'disponivel',
  ultimo_status_em timestamptz NOT NULL DEFAULT now(),
  valor_padrao_corrida numeric(12, 2) NOT NULL DEFAULT 0
);

ALTER TABLE public.store_entregadores
  ADD COLUMN IF NOT EXISTS telefone text;

ALTER TABLE public.store_entregadores
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'fixo';

ALTER TABLE public.store_entregadores
  ADD COLUMN IF NOT EXISTS status_operacional text NOT NULL DEFAULT 'disponivel';

ALTER TABLE public.store_entregadores
  ADD COLUMN IF NOT EXISTS ultimo_status_em timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.store_entregadores
  ADD COLUMN IF NOT EXISTS valor_padrao_corrida numeric(12, 2) NOT NULL DEFAULT 0;

COMMENT ON TABLE public.store_entregadores IS
  'Entregadores da loja (cadastro, status operacional, acertos no caixa).';

CREATE INDEX IF NOT EXISTS idx_store_entregadores_store_ativo
  ON public.store_entregadores (store_id, ativo);

CREATE INDEX IF NOT EXISTS idx_store_entregadores_store_status
  ON public.store_entregadores (store_id, status_operacional);

-- ---------------------------------------------------------------------------
-- entregas (corrida + acerto financeiro)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  entregador_id uuid,
  entregador_nome text NOT NULL,
  valor_corrida numeric(12, 2) NOT NULL DEFAULT 0,
  valor_recebido_cliente numeric(12, 2) NOT NULL DEFAULT 0,
  forma_pagamento_entrega text,
  turno_id uuid,
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  acerto_movimentacao_id uuid,
  acertado_em timestamptz
);

ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS acerto_movimentacao_id uuid;

ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS acertado_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_entregas_store_criado
  ON public.entregas (store_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_entregas_store_entregador_acerto
  ON public.entregas (store_id, entregador_id, acertado_em);

CREATE UNIQUE INDEX IF NOT EXISTS entregas_store_order_uidx
  ON public.entregas (store_id, order_id);

-- ---------------------------------------------------------------------------
-- RLS: store_entregadores
-- ---------------------------------------------------------------------------
ALTER TABLE public.store_entregadores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_entregadores_owner_sel ON public.store_entregadores;
CREATE POLICY store_entregadores_owner_sel
  ON public.store_entregadores
  FOR SELECT
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS store_entregadores_owner_ins ON public.store_entregadores;
CREATE POLICY store_entregadores_owner_ins
  ON public.store_entregadores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS store_entregadores_owner_upd ON public.store_entregadores;
CREATE POLICY store_entregadores_owner_upd
  ON public.store_entregadores
  FOR UPDATE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  )
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS store_entregadores_owner_del ON public.store_entregadores;
CREATE POLICY store_entregadores_owner_del
  ON public.store_entregadores
  FOR DELETE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_entregadores TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: entregas
-- ---------------------------------------------------------------------------
ALTER TABLE public.entregas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entregas_owner_sel ON public.entregas;
CREATE POLICY entregas_owner_sel
  ON public.entregas
  FOR SELECT
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS entregas_owner_ins ON public.entregas;
CREATE POLICY entregas_owner_ins
  ON public.entregas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS entregas_owner_upd ON public.entregas;
CREATE POLICY entregas_owner_upd
  ON public.entregas
  FOR UPDATE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  )
  WITH CHECK (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS entregas_owner_del ON public.entregas;
CREATE POLICY entregas_owner_del
  ON public.entregas
  FOR DELETE
  TO authenticated
  USING (
    public.store_owner_can_operate(store_id)
    AND public.store_plan_tier_at_least(store_id, 1)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entregas TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: caixa (turno aberto + acerto_entregador)
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
