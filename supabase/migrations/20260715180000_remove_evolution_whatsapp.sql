DROP TABLE IF EXISTS public.whatsapp_auto_reply_cooldowns;
DROP TABLE IF EXISTS public.whatsapp_automations;

ALTER TABLE public.stores
  DROP COLUMN IF EXISTS auto_whatsapp_delivery;
