-- Remove integração Mercado Pago / cobrança mensal Vyria (aplicar no SQL Editor do Supabase)
-- Cópia de supabase/migrations/20260805210000_drop_subscription_billing_schema.sql

DROP TABLE IF EXISTS public.subscription_invoices CASCADE;
DROP TABLE IF EXISTS public.platform_billing_config CASCADE;

ALTER TABLE public.stores
  DROP COLUMN IF EXISTS billing_subscription_status,
  DROP COLUMN IF EXISTS billing_overdue_at,
  DROP COLUMN IF EXISTS billing_invoice_pay_url,
  DROP COLUMN IF EXISTS billing_next_charge_at,
  DROP COLUMN IF EXISTS billing_open_invoice_at;
