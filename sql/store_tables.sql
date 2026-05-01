-- Mesas configuráveis por loja (Garçom). Executar no Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.store_tables (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  ambiente text NOT NULL DEFAULT 'Salão',
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_store_tables_store_id ON public.store_tables(store_id);
CREATE INDEX IF NOT EXISTS idx_store_tables_store_ambiente ON public.store_tables(store_id, ambiente);
