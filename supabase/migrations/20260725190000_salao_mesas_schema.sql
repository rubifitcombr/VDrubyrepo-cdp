-- Salão / Mesas: schema base, garçons, colunas em pedidos e RLS de store_tables.
-- Idempotente — aplicar no SQL Editor do Supabase se o fluxo Garçom / Mesas falhar.

-- ---------------------------------------------------------------------------
-- store_tables (mapa de mesas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ambiente text,
  name text,
  active boolean,
  sort_order integer
);

ALTER TABLE public.store_tables
  ADD COLUMN IF NOT EXISTS ambiente text;

ALTER TABLE public.store_tables
  ADD COLUMN IF NOT EXISTS name text;

ALTER TABLE public.store_tables
  ADD COLUMN IF NOT EXISTS active boolean;

ALTER TABLE public.store_tables
  ADD COLUMN IF NOT EXISTS sort_order integer;

COMMENT ON TABLE public.store_tables IS
  'Mesas configuradas por loja (mapa Garçom, QR autoatendimento).';

-- Sincroniza colunas legadas nome/ativo com name/active.
CREATE OR REPLACE FUNCTION public.sync_store_tables_legacy_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.nome IS NULL OR btrim(NEW.nome) = '' THEN
    NEW.nome := COALESCE(NULLIF(btrim(NEW.name), ''), 'Mesa');
  END IF;
  IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
    NEW.name := NEW.nome;
  END IF;
  IF NEW.ativo IS NULL THEN
    NEW.ativo := COALESCE(NEW.active, true);
  END IF;
  IF NEW.active IS NULL THEN
    NEW.active := COALESCE(NEW.ativo, true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_store_tables_legacy ON public.store_tables;
CREATE TRIGGER trg_sync_store_tables_legacy
  BEFORE INSERT OR UPDATE ON public.store_tables
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_store_tables_legacy_columns();

-- RLS (inclui SELECT — necessário para o mapa de mesas)
ALTER TABLE public.store_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_tables_owner_sel ON public.store_tables;
CREATE POLICY store_tables_owner_sel
  ON public.store_tables
  FOR SELECT
  TO authenticated
  USING (
    store_owner_can_operate(store_id)
    AND store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS store_tables_owner_ins ON public.store_tables;
CREATE POLICY store_tables_owner_ins
  ON public.store_tables
  FOR INSERT
  TO authenticated
  WITH CHECK (
    store_owner_can_operate(store_id)
    AND store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS store_tables_owner_upd ON public.store_tables;
CREATE POLICY store_tables_owner_upd
  ON public.store_tables
  FOR UPDATE
  TO authenticated
  USING (
    store_owner_can_operate(store_id)
    AND store_plan_tier_at_least(store_id, 1)
  )
  WITH CHECK (
    store_owner_can_operate(store_id)
    AND store_plan_tier_at_least(store_id, 1)
  );

DROP POLICY IF EXISTS store_tables_owner_del ON public.store_tables;
CREATE POLICY store_tables_owner_del
  ON public.store_tables
  FOR DELETE
  TO authenticated
  USING (
    store_owner_can_operate(store_id)
    AND store_plan_tier_at_least(store_id, 1)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_tables TO authenticated;

-- ---------------------------------------------------------------------------
-- store_garcons (PIN por garçom no salão)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_garcons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  pin text,
  pin_ativo boolean NOT NULL DEFAULT false,
  email text,
  telefone text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_garcons
  ADD COLUMN IF NOT EXISTS pin text;

ALTER TABLE public.store_garcons
  ADD COLUMN IF NOT EXISTS pin_ativo boolean NOT NULL DEFAULT false;

ALTER TABLE public.store_garcons
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.store_garcons
  ADD COLUMN IF NOT EXISTS telefone text;

ALTER TABLE public.store_garcons
  ADD COLUMN IF NOT EXISTS criado_em timestamptz NOT NULL DEFAULT now();

COMMENT ON TABLE public.store_garcons IS
  'Garçons da loja (PIN de 4 dígitos, relatório de vendas no salão).';

CREATE INDEX IF NOT EXISTS idx_store_garcons_store_ativo
  ON public.store_garcons (store_id, ativo);

CREATE INDEX IF NOT EXISTS idx_store_garcons_store_nome
  ON public.store_garcons (store_id, nome);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_garcons_store_pin_active
  ON public.store_garcons (store_id, pin)
  WHERE pin IS NOT NULL AND pin_ativo = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_garcons TO authenticated;

-- ---------------------------------------------------------------------------
-- stores: modo de atendimento no salão + setores (Growth+ / Pro)
-- ---------------------------------------------------------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS salao_attendance_mode text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS table_sectors jsonb;

COMMENT ON COLUMN public.stores.salao_attendance_mode IS
  'Modo no painel Garçom: waiter (garçom) ou self_service (autoatendimento). Pro pode alternar.';

COMMENT ON COLUMN public.stores.table_sectors IS
  'Lista JSON de setores do salão (ex.: ["Salão","Varanda"]) para mapa Garçom / QR mesa.';

UPDATE public.stores
SET table_sectors = '[]'::jsonb
WHERE table_sectors IS NULL;

-- ---------------------------------------------------------------------------
-- orders: garçom e taxa de serviço (relatório + fecho de comanda)
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS garcom_id uuid;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS garcom_nome text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_fee_brl numeric(12, 2);

COMMENT ON COLUMN public.orders.garcom_id IS
  'Garçom que registou/fechou a comanda (store_garcons.id).';
COMMENT ON COLUMN public.orders.garcom_nome IS
  'Nome do garçom no momento do pedido (desnormalizado).';
COMMENT ON COLUMN public.orders.service_fee_brl IS
  'Taxa de serviço (gorjeta) em BRL na comanda de mesa.';

CREATE INDEX IF NOT EXISTS idx_orders_store_garcom_created
  ON public.orders (store_id, garcom_id, created_at DESC)
  WHERE source = 'waiter' AND garcom_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Realtime (mapa Garçom / Mesas sincroniza com QR e KDS)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'store_tables'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.store_tables;
  END IF;
END $$;

SELECT pg_notify('pgrst', 'reload schema');
