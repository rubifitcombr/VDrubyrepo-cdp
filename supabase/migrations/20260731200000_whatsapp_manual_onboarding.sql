-- WhatsApp Master: onboarding manual (Vyria activa; lojista solicita número).

ALTER TABLE public.store_whatsapp_config
  ADD COLUMN IF NOT EXISTS onboarding_contact_phone text,
  ADD COLUMN IF NOT EXISTS onboarding_notes text,
  ADD COLUMN IF NOT EXISTS onboarding_requested_at timestamptz;

COMMENT ON COLUMN public.store_whatsapp_config.onboarding_contact_phone IS
  'Telefone informado pelo lojista ao solicitar activação manual.';
COMMENT ON COLUMN public.store_whatsapp_config.onboarding_notes IS
  'Observações do lojista na solicitação de activação.';
COMMENT ON COLUMN public.store_whatsapp_config.onboarding_requested_at IS
  'Quando o lojista pediu activação do WhatsApp Master.';
