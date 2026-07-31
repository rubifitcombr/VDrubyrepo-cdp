-- Master: quota de IA de marketing, índice de webhook WhatsApp.
-- Idempotente.

-- ---------------------------------------------------------------------------
-- Índice — lookup de loja por phone_number_id no webhook Meta
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_store_whatsapp_config_phone_number_id
  ON public.store_whatsapp_config (phone_number_id)
  WHERE phone_number_id IS NOT NULL AND status = 'active';

-- ---------------------------------------------------------------------------
-- store_marketing_ai_usage — contadores mensais (descrição / imagem)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_marketing_ai_usage (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  year_month text NOT NULL,
  description_count integer NOT NULL DEFAULT 0,
  image_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, year_month)
);

DO $$
BEGIN
  ALTER TABLE public.store_marketing_ai_usage
    ADD CONSTRAINT store_marketing_ai_usage_ym_chk
    CHECK (year_month ~ '^\d{4}-\d{2}$');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.store_marketing_ai_usage
    ADD CONSTRAINT store_marketing_ai_usage_description_count_chk
    CHECK (description_count >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.store_marketing_ai_usage
    ADD CONSTRAINT store_marketing_ai_usage_image_count_chk
    CHECK (image_count >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.store_marketing_ai_usage IS
  'Uso mensal de IA (descrições de produto, imagens de campanha) por loja.';

-- ---------------------------------------------------------------------------
-- increment_store_marketing_ai_usage — RPC chamada pelo painel autenticado
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_store_marketing_ai_usage(
  p_store_id uuid,
  p_ym text,
  p_kind text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_owns_store(p_store_id) THEN
    RAISE EXCEPTION 'Sem permissão para esta loja.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.store_marketing_ai_usage (
    store_id,
    year_month,
    description_count,
    image_count
  )
  VALUES (
    p_store_id,
    p_ym,
    CASE WHEN p_kind = 'description' THEN 1 ELSE 0 END,
    CASE WHEN p_kind = 'image' THEN 1 ELSE 0 END
  )
  ON CONFLICT (store_id, year_month) DO UPDATE SET
    description_count = public.store_marketing_ai_usage.description_count
      + CASE WHEN p_kind = 'description' THEN 1 ELSE 0 END,
    image_count = public.store_marketing_ai_usage.image_count
      + CASE WHEN p_kind = 'image' THEN 1 ELSE 0 END,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_store_marketing_ai_usage(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS — quota de IA (leitura/escrita pelo dono da loja)
-- ---------------------------------------------------------------------------
ALTER TABLE public.store_marketing_ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_marketing_ai_usage_owner ON public.store_marketing_ai_usage;
CREATE POLICY store_marketing_ai_usage_owner
  ON public.store_marketing_ai_usage
  FOR ALL
  TO authenticated
  USING (public.auth_owns_store(store_id))
  WITH CHECK (public.auth_owns_store(store_id));

REVOKE ALL ON public.store_marketing_ai_usage FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_marketing_ai_usage TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
