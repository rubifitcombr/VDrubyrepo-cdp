-- PIX directo ao lojista (sem gateway Vyria)
-- Executar no Supabase SQL Editor se as migrations automáticas não correrem.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS pix_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pix_key_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS pix_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS pix_receiver_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS pix_receiver_city VARCHAR(255);

COMMENT ON COLUMN public.stores.pix_enabled IS 'Aceitar PIX no checkout público (chave na conta do lojista).';
COMMENT ON COLUMN public.stores.pix_key_type IS 'cpf | cnpj | email | phone | random';
COMMENT ON COLUMN public.stores.pix_key IS 'Chave PIX do estabelecimento.';
COMMENT ON COLUMN public.stores.pix_receiver_name IS 'Nome do recebedor (BR Code, máx. 25 caracteres).';
COMMENT ON COLUMN public.stores.pix_receiver_city IS 'Cidade do recebedor (BR Code, máx. 15 caracteres).';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS pix_payload TEXT,
  ADD COLUMN IF NOT EXISTS pix_paid_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.payment_status IS 'pending | customer_reported | paid | confirmed | approved | completed.';
COMMENT ON COLUMN public.orders.pix_payload IS 'Payload BR Code PIX copia e cola gerado no checkout.';
COMMENT ON COLUMN public.orders.pix_paid_at IS 'Quando o cliente informou pagamento ou o provedor confirmou o PIX.';
