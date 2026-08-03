-- Falhas de envio WhatsApp (visibilidade no painel Master).

CREATE TABLE IF NOT EXISTS public.whatsapp_send_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_phone text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  flow text NOT NULL,
  error_code integer,
  error_message text NOT NULL,
  is_window_expired boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_send_failures_store_created
  ON public.whatsapp_send_failures (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_send_failures_store_window
  ON public.whatsapp_send_failures (store_id, is_window_expired, created_at DESC);

DO $$
BEGIN
  ALTER TABLE public.whatsapp_send_failures
    ADD CONSTRAINT whatsapp_send_failures_message_type_chk
    CHECK (message_type IN ('text', 'image', 'interactive'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.whatsapp_send_failures
    ADD CONSTRAINT whatsapp_send_failures_flow_chk
    CHECK (
      flow IN (
        'order_notification',
        'loyalty',
        'robot',
        'marketing',
        'test'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.whatsapp_send_failures IS
  'Falhas ao enviar mensagens WhatsApp (Graph API), incluindo janela 24h expirada (131047).';

ALTER TABLE public.whatsapp_send_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_send_failures_owner_select ON public.whatsapp_send_failures;
CREATE POLICY whatsapp_send_failures_owner_select
  ON public.whatsapp_send_failures
  FOR SELECT
  TO authenticated
  USING (
    public.auth_owns_store(store_id)
    AND public.store_plan_tier_at_least(store_id, 3)
  );

REVOKE ALL ON public.whatsapp_send_failures FROM anon;
GRANT SELECT ON public.whatsapp_send_failures TO authenticated;
