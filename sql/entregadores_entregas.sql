-- Entregadores e corridas (conferência no Caixa). Executar no Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.store_entregadores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  nome text NOT NULL,
  telefone text,
  tipo text NOT NULL DEFAULT 'fixo' CHECK (tipo IN ('fixo', 'autonomo')),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_entregadores_store
  ON public.store_entregadores (store_id);

CREATE INDEX IF NOT EXISTS idx_store_entregadores_store_ativo
  ON public.store_entregadores (store_id, ativo);

CREATE TABLE IF NOT EXISTS public.entregas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  entregador_id uuid REFERENCES public.store_entregadores (id) ON DELETE SET NULL,
  entregador_nome text NOT NULL,
  valor_corrida numeric NOT NULL DEFAULT 0,
  valor_recebido_cliente numeric NOT NULL DEFAULT 0,
  forma_pagamento_entrega text,
  turno_id uuid REFERENCES public.caixas_turnos (id) ON DELETE SET NULL,
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entregas_valor_corrida_nonneg CHECK (valor_corrida >= 0),
  CONSTRAINT entregas_valor_recebido_nonneg CHECK (valor_recebido_cliente >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entregas_order_id ON public.entregas (order_id);

CREATE INDEX IF NOT EXISTS idx_entregas_store_turno
  ON public.entregas (store_id, turno_id);

CREATE INDEX IF NOT EXISTS idx_entregas_store_criado
  ON public.entregas (store_id, criado_em DESC);

-- Tipos de movimentação de caixa (inclui acerto com entregador)
ALTER TABLE public.caixa_movimentacoes
  DROP CONSTRAINT IF EXISTS caixa_movimentacoes_tipo_check;

ALTER TABLE public.caixa_movimentacoes
  ADD CONSTRAINT caixa_movimentacoes_tipo_check
  CHECK (tipo IN ('suprimento', 'sangria', 'acerto_entregador'));

-- RLS (dono da loja)
ALTER TABLE public.store_entregadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entregas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_entregadores_all_owner" ON public.store_entregadores;
CREATE POLICY "store_entregadores_all_owner"
  ON public.store_entregadores FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_entregadores.store_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "entregas_all_owner" ON public.entregas;
CREATE POLICY "entregas_all_owner"
  ON public.entregas FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = entregas.store_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_id = auth.uid()
    )
  );
