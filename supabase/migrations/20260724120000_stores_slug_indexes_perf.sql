-- Performance: lookups por slug (cardápio público) + pós-login + produtos.
-- Idempotente — aplicar no SQL Editor do Supabase se migrações CLI não estiverem ligadas.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Lookup RPC etapa 1: lower(trim(slug)) = lower(trim(p_slug))
CREATE INDEX IF NOT EXISTS stores_slug_lower_trim_idx
  ON public.stores (lower(trim(slug)));

-- Fallback ILIKE na RPC e no service role
CREATE INDEX IF NOT EXISTS stores_slug_trgm_idx
  ON public.stores USING gin (slug gin_trgm_ops);

-- eq('slug', ...) no PostgREST (match exacto)
CREATE INDEX IF NOT EXISTS stores_slug_idx
  ON public.stores (slug);

-- Pós-login / gates: .eq('owner_id', user.id)
CREATE INDEX IF NOT EXISTS stores_owner_id_idx
  ON public.stores (owner_id);

-- Cardápio: products por loja activa + ordenação
CREATE INDEX IF NOT EXISTS products_store_active_sort_idx
  ON public.products (store_id, active, sort_order, name);

-- Unicidade case-insensitive (só se não houver duplicados — falha com mensagem clara)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'stores'
      AND indexname = 'stores_slug_lower_trim_unique_idx'
  ) THEN
    CREATE UNIQUE INDEX stores_slug_lower_trim_unique_idx
      ON public.stores (lower(trim(slug)))
      WHERE slug IS NOT NULL AND btrim(slug) <> '';
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'stores_slug_lower_trim_unique_idx: slugs duplicados — corrija dados antes do índice único';
END $$;

SELECT pg_notify('pgrst', 'reload schema');
