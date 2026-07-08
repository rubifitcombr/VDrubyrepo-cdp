-- Cadastro de garçons (Meus garçons) — executar no Supabase SQL Editor (idempotente).

CREATE TABLE IF NOT EXISTS public.store_garcons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  nome text NOT NULL,
  email text,
  telefone text,
  ativo boolean NOT NULL DEFAULT true,
  pin text,
  pin_ativo boolean NOT NULL DEFAULT false,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_garcons_store_ativo
  ON public.store_garcons (store_id, ativo);

CREATE INDEX IF NOT EXISTS idx_store_garcons_store_nome
  ON public.store_garcons (store_id, nome);

ALTER TABLE public.store_garcons
  ADD COLUMN IF NOT EXISTS pin text;

ALTER TABLE public.store_garcons
  ADD COLUMN IF NOT EXISTS pin_ativo boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_garcons_store_pin_active
  ON public.store_garcons (store_id, pin)
  WHERE pin IS NOT NULL AND pin_ativo = true;

ALTER TABLE public.store_garcons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_garcons_select_owner ON public.store_garcons;
CREATE POLICY store_garcons_select_owner ON public.store_garcons
  FOR SELECT USING (
    store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS store_garcons_insert_owner ON public.store_garcons;
CREATE POLICY store_garcons_insert_owner ON public.store_garcons
  FOR INSERT WITH CHECK (
    store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS store_garcons_update_owner ON public.store_garcons;
CREATE POLICY store_garcons_update_owner ON public.store_garcons
  FOR UPDATE USING (
    store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS store_garcons_delete_owner ON public.store_garcons;
CREATE POLICY store_garcons_delete_owner ON public.store_garcons
  FOR DELETE USING (
    store_id IN (SELECT id FROM public.stores WHERE owner_id = auth.uid())
  );

-- Pedidos atribuídos a garçons (relatório)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS garcom_id uuid REFERENCES public.store_garcons(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS garcom_nome text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_fee_brl numeric(12, 2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_store_garcom_waiter
  ON public.orders (store_id, garcom_id, created_at)
  WHERE source = 'waiter' AND garcom_id IS NOT NULL;
