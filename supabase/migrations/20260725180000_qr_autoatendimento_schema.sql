-- QR autoatendimento (?auto=1): setores de mesa persistidos + realtime operacional.
-- Idempotente.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS table_sectors jsonb;

COMMENT ON COLUMN public.stores.table_sectors IS
  'Lista JSON de setores do salão (ex.: ["Salão","Varanda"]) para mapa Garçom / QR mesa.';

-- Preenche setores a partir das mesas já configuradas.
UPDATE public.stores s
SET table_sectors = COALESCE(
  (
    SELECT jsonb_agg(sector ORDER BY sector)
    FROM (
      SELECT DISTINCT btrim(st.ambiente) AS sector
      FROM public.store_tables st
      WHERE st.store_id = s.id
        AND btrim(coalesce(st.ambiente, '')) <> ''
    ) d
  ),
  '[]'::jsonb
)
WHERE table_sectors IS NULL;

UPDATE public.stores
SET table_sectors = '[]'::jsonb
WHERE table_sectors IS NULL;

-- Realtime: painéis Garçom, KDS, Pedidos e Caixa sincronizam com QR.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;

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
