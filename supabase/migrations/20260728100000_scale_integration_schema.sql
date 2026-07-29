-- Integração de balança (plano Pro, presencial): produtos pesáveis, itens decimais e config da loja.
-- Idempotente — aplicar no SQL Editor do Supabase se migrations locais não correrem.

-- ---------------------------------------------------------------------------
-- products: vendidos por peso (PDV / garçom — não aparecem no cardápio público)
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sold_by_weight boolean NOT NULL DEFAULT false;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_per_kg numeric(12, 4);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS plu_code text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS default_tare_kg numeric(8, 4) NOT NULL DEFAULT 0;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS min_weight_kg numeric(8, 4) NOT NULL DEFAULT 0.010;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS max_weight_kg numeric(8, 4) NOT NULL DEFAULT 50;

COMMENT ON COLUMN public.products.sold_by_weight IS
  'Produto pesável (R$/kg). Exclusivo presencial — oculto no cardápio público online.';
COMMENT ON COLUMN public.products.price_per_kg IS
  'Preço por quilograma quando sold_by_weight = true.';
COMMENT ON COLUMN public.products.plu_code IS
  'Código PLU (2–5 dígitos) para etiqueta EAN-13 pesável; único por loja.';
COMMENT ON COLUMN public.products.default_tare_kg IS
  'Tara padrão em kg (prato/embalagem) descontada na pesagem ao vivo.';
COMMENT ON COLUMN public.products.min_weight_kg IS
  'Peso mínimo aceite na venda (kg).';
COMMENT ON COLUMN public.products.max_weight_kg IS
  'Peso máximo aceite na venda (kg) — anti-fraude.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_store_plu_weighable
  ON public.products (store_id, plu_code)
  WHERE sold_by_weight = true
    AND plu_code IS NOT NULL
    AND btrim(plu_code) <> '';

DO $$
BEGIN
  ALTER TABLE public.products
    ADD CONSTRAINT products_weighable_price_plu_chk
    CHECK (
      NOT sold_by_weight
      OR (
        price_per_kg IS NOT NULL
        AND price_per_kg > 0
        AND plu_code IS NOT NULL
        AND btrim(plu_code) <> ''
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- order_items: quantidade decimal para itens por peso
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_items
  ALTER COLUMN quantity TYPE numeric(10, 4) USING quantity::numeric(10, 4);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS unit_type text NOT NULL DEFAULT 'unit';

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS weight_kg numeric(10, 4);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS price_per_kg_snapshot numeric(12, 4);

COMMENT ON COLUMN public.order_items.unit_type IS
  'unit = quantidade inteira; weight = vendido por kg (quantity = peso em kg).';
COMMENT ON COLUMN public.order_items.weight_kg IS
  'Snapshot do peso em kg no momento da venda (espelha quantity quando unit_type = weight).';
COMMENT ON COLUMN public.order_items.price_per_kg_snapshot IS
  'Preço por kg no momento da venda (itens pesáveis).';

DO $$
BEGIN
  ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_unit_type_chk
    CHECK (unit_type IN ('unit', 'weight'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- stores: configuração de balança (Web Serial, Print Agent ou só etiqueta)
-- ---------------------------------------------------------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS scale_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS scale_connection text NOT NULL DEFAULT 'web_serial';

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS scale_brand text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS scale_protocol text NOT NULL DEFAULT 'toledo_p03';

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS scale_baud_rate integer NOT NULL DEFAULT 9600;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS scale_auto_add_stable boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS scale_plu_prefix text NOT NULL DEFAULT '2';

COMMENT ON COLUMN public.stores.scale_enabled IS
  'Integração de balança activa (plano Pro, presencial/híbrido).';
COMMENT ON COLUMN public.stores.scale_connection IS
  'web_serial | agent | barcode_only';
COMMENT ON COLUMN public.stores.scale_protocol IS
  'Protocolo serial (ex.: toledo_p03).';
COMMENT ON COLUMN public.stores.scale_plu_prefix IS
  'Prefixo EAN-13 para produtos pesáveis (padrão varejo BR: 2).';

DO $$
BEGIN
  ALTER TABLE public.stores
    ADD CONSTRAINT stores_scale_connection_chk
    CHECK (scale_connection IN ('web_serial', 'agent', 'barcode_only'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
