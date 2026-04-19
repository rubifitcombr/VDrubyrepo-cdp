-- Executar no SQL Editor do Supabase (projeto Vyria Delivery).
-- Faturas manuais (painel admin) + pedidos de cancelamento (lojista).

CREATE TABLE IF NOT EXISTS public.faturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  descricao varchar(200) NOT NULL,
  valor numeric(10, 2) NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('pago', 'pendente', 'falhou')),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS faturas_store_id_idx ON public.faturas(store_id);

ALTER TABLE public.faturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "faturas_select_lojista"
  ON public.faturas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = faturas.store_id AND s.owner_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.assinatura_cancelamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  motivo text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assinatura_cancelamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assinatura_cancel_insert_lojista"
  ON public.assinatura_cancelamentos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = assinatura_cancelamentos.store_id AND s.owner_id = auth.uid()
    )
  );

CREATE POLICY "assinatura_cancel_select_lojista"
  ON public.assinatura_cancelamentos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = assinatura_cancelamentos.store_id AND s.owner_id = auth.uid()
    )
  );

-- Inserções admin (faturas) via service role nas APIs — sem policy pública de INSERT.
