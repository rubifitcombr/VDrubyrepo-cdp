-- WhatsApp: auto_reply_enabled + handoff humano (idempotente).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'store_whatsapp_config'
      AND column_name = 'ai_enabled'
  ) THEN
    ALTER TABLE public.store_whatsapp_config
      RENAME COLUMN ai_enabled TO auto_reply_enabled;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'store_whatsapp_config'
      AND column_name = 'auto_reply_enabled'
  ) THEN
    ALTER TABLE public.store_whatsapp_config
      ADD COLUMN auto_reply_enabled boolean NOT NULL DEFAULT true;
  END IF;
END $$;

COMMENT ON COLUMN public.store_whatsapp_config.auto_reply_enabled IS
  'Atendimento automático (menu interactivo + respostas por intenção).';

ALTER TABLE public.store_whatsapp_contacts
  ADD COLUMN IF NOT EXISTS conversation_status text NOT NULL DEFAULT 'auto';

DO $$
BEGIN
  ALTER TABLE public.store_whatsapp_contacts
    ADD CONSTRAINT store_whatsapp_contacts_conversation_status_chk
    CHECK (conversation_status IN ('auto', 'humano'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.store_whatsapp_contacts.conversation_status IS
  'auto = robô activo; humano = cliente pediu atendente (bot pausado).';
