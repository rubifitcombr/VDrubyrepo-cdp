-- Aparência (/dashboard/appearance): tema do cardápio e banner público.
-- Idempotente — aplicar no SQL Editor do Supabase se a janela Aparência falhar ao guardar.
-- RLS em stores: também 20260725190010_configuracoes_schema.sql se updateStore falhar por permissão.

-- ---------------------------------------------------------------------------
-- stores: tema e banner do cardápio público
-- ---------------------------------------------------------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS theme_preset text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS storefront_banner_url text;

COMMENT ON COLUMN public.stores.theme_preset IS
  'Preset de cores do cardápio público (pizzaria, acai, padrao, etc.).';
COMMENT ON COLUMN public.stores.storefront_banner_url IS
  'URL da imagem de capa no topo do cardápio público.';

-- Legado: cover_url → storefront_banner_url
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stores' AND column_name = 'cover_url'
  ) THEN
    UPDATE public.stores
    SET storefront_banner_url = cover_url
    WHERE storefront_banner_url IS NULL
      AND cover_url IS NOT NULL
      AND btrim(cover_url) <> '';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- stores: lojista atualiza tema/banner via updateStore (browser autenticado)
-- ---------------------------------------------------------------------------
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stores_owner_select ON public.stores;
CREATE POLICY stores_owner_select
  ON public.stores
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS stores_owner_insert ON public.stores;
CREATE POLICY stores_owner_insert
  ON public.stores
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS stores_owner_update ON public.stores;
CREATE POLICY stores_owner_update
  ON public.stores
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.stores TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
