-- Contrato anual Vyria Delivery — colunas em stores + auditoria + bucket PDF.
-- Idempotente — executar no SQL Editor do Supabase (Project → SQL → New query)
-- se activar/renovar lojista ou assinar contrato anual falhar por colunas em falta.

-- ---------------------------------------------------------------------------
-- stores — ciclo de facturação e aceite do contrato anual
-- ---------------------------------------------------------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS contrato_inicio_em date,
  ADD COLUMN IF NOT EXISTS contrato_fim_em date,
  ADD COLUMN IF NOT EXISTS contrato_mensal_brl numeric(12, 2),
  ADD COLUMN IF NOT EXISTS contrato_desconto_pct numeric(5, 2),
  ADD COLUMN IF NOT EXISTS contrato_aceite_em timestamptz,
  ADD COLUMN IF NOT EXISTS contrato_assinatura_nome text,
  ADD COLUMN IF NOT EXISTS contrato_assinatura_png text,
  ADD COLUMN IF NOT EXISTS contrato_termos_versao text,
  ADD COLUMN IF NOT EXISTS contrato_aceite_por uuid,
  ADD COLUMN IF NOT EXISTS contrato_documento_tipo text,
  ADD COLUMN IF NOT EXISTS contrato_documento_numero text,
  ADD COLUMN IF NOT EXISTS contrato_representante_cargo text,
  ADD COLUMN IF NOT EXISTS contrato_documento_hash text,
  ADD COLUMN IF NOT EXISTS contrato_pdf_path text,
  ADD COLUMN IF NOT EXISTS contrato_aceite_ip text,
  ADD COLUMN IF NOT EXISTS contrato_aceite_user_agent text,
  ADD COLUMN IF NOT EXISTS contrato_aceite_email text,
  ADD COLUMN IF NOT EXISTS plano_ativado_em timestamptz;

DO $$
BEGIN
  ALTER TABLE public.stores
    ADD CONSTRAINT stores_billing_cycle_chk
    CHECK (billing_cycle IN ('monthly', 'annual'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.stores.billing_cycle IS
  'Ciclo comercial: monthly (mensal) ou annual (compromisso 12 meses com desconto).';

-- ---------------------------------------------------------------------------
-- contrato_aceites — auditoria de assinaturas (só service role)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contrato_aceites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  termos_versao text NOT NULL,
  documento_hash text NOT NULL,
  assinatura_nome text NOT NULL,
  documento_tipo text NOT NULL,
  documento_numero text NOT NULL,
  representante_cargo text NOT NULL,
  aceite_representante_legal boolean NOT NULL DEFAULT true,
  aceite_termos boolean NOT NULL DEFAULT true,
  aceite_compromisso_12m boolean NOT NULL DEFAULT true,
  ip_address text,
  user_agent text,
  user_id uuid,
  user_email text,
  pdf_storage_path text,
  contrato_inicio_em date,
  contrato_fim_em date,
  mensal_brl numeric(12, 2),
  documento_canonico jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contrato_aceites_store_criado
  ON public.contrato_aceites (store_id, criado_em DESC);

ALTER TABLE public.contrato_aceites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contrato_aceites FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage — PDFs assinados (upload via service role)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contratos', 'contratos', false, 10485760, ARRAY['application/pdf']::text[])
ON CONFLICT (id) DO NOTHING;

SELECT pg_notify('pgrst', 'reload schema');
