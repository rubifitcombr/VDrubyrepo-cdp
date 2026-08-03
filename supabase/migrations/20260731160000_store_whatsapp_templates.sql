-- Templates Meta por loja (criação automática no Embedded Signup).

CREATE TABLE IF NOT EXISTS public.store_whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  template_name text NOT NULL,
  category text NOT NULL,
  language text NOT NULL DEFAULT 'pt_BR',
  status text NOT NULL DEFAULT 'pending',
  meta_template_id text,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, template_name)
);

CREATE INDEX IF NOT EXISTS idx_store_whatsapp_templates_store
  ON public.store_whatsapp_templates (store_id, template_name);

CREATE INDEX IF NOT EXISTS idx_store_whatsapp_config_waba_id
  ON public.store_whatsapp_config (waba_id)
  WHERE waba_id IS NOT NULL AND status = 'active';

DO $$
BEGIN
  ALTER TABLE public.store_whatsapp_templates
    ADD CONSTRAINT store_whatsapp_templates_category_chk
    CHECK (category IN ('utility', 'marketing'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.store_whatsapp_templates
    ADD CONSTRAINT store_whatsapp_templates_status_chk
    CHECK (status IN ('pending', 'approved', 'rejected'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.store_whatsapp_templates IS
  'Templates WhatsApp Cloud API por loja (status sincronizado via webhook message_template_status_update).';

ALTER TABLE public.store_whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_whatsapp_templates_owner_select ON public.store_whatsapp_templates;
CREATE POLICY store_whatsapp_templates_owner_select
  ON public.store_whatsapp_templates
  FOR SELECT
  TO authenticated
  USING (
    public.auth_owns_store(store_id)
    AND public.store_plan_tier_at_least(store_id, 3)
  );

REVOKE ALL ON public.store_whatsapp_templates FROM anon;
GRANT SELECT ON public.store_whatsapp_templates TO authenticated;
