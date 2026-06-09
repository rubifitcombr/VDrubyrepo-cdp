-- Gestão operacional de entregadores: despacho, status e acertos estruturados.

CREATE TABLE IF NOT EXISTS public.store_entregadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  nome text NOT NULL,
  telefone text,
  tipo text NOT NULL DEFAULT 'fixo' CHECK (tipo IN ('fixo', 'autonomo')),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  entregador_id uuid REFERENCES public.store_entregadores(id) ON DELETE SET NULL,
  entregador_nome text NOT NULL DEFAULT '—',
  valor_corrida numeric(12, 2) NOT NULL DEFAULT 0,
  valor_recebido_cliente numeric(12, 2) NOT NULL DEFAULT 0,
  forma_pagamento_entrega text,
  turno_id uuid,
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

ALTER TABLE public.store_entregadores
  ADD COLUMN IF NOT EXISTS status_operacional text NOT NULL DEFAULT 'disponivel';

ALTER TABLE public.store_entregadores
  ADD COLUMN IF NOT EXISTS ultimo_status_em timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.store_entregadores
  ADD COLUMN IF NOT EXISTS valor_padrao_corrida numeric(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS entregador_id uuid REFERENCES public.store_entregadores(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS entregador_nome text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS entrega_despachada_em timestamptz;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS entrega_prazo_minutos integer NOT NULL DEFAULT 45;

ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS acerto_movimentacao_id uuid;

ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS acertado_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_store_entregador_status
  ON public.orders (store_id, status, entregador_id)
  WHERE entregador_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entregas_store_entregador_acerto
  ON public.entregas (store_id, entregador_id, acertado_em);
