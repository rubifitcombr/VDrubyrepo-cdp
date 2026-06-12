-- Financeiro do Caixa: fornecedores, receitas/despesas e contas pendentes.

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  nome text NOT NULL,
  telefone text,
  email text,
  categoria text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  categoria text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  valor numeric(12, 2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  vencimento timestamptz,
  data_pagamento timestamptz,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_store_nome
  ON public.suppliers (store_id, nome);

CREATE INDEX IF NOT EXISTS idx_financial_entries_store_created
  ON public.financial_entries (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_entries_store_status
  ON public.financial_entries (store_id, status, vencimento);

CREATE INDEX IF NOT EXISTS idx_financial_entries_supplier_pending
  ON public.financial_entries (store_id, supplier_id, status)
  WHERE tipo = 'despesa';
