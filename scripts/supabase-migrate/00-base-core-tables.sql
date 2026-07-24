-- Tabelas core Vyria (base antes das migrações em supabase/migrations/).
-- Idempotente — seguro correr no projeto NOVO.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── stores ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text,
  status text NOT NULL DEFAULT 'pendente',
  merchant_status text,
  plano text,
  plan text,
  phone text,
  address text,
  operation_mode text,
  plano_vence_em date,
  billing_cycle text NOT NULL DEFAULT 'monthly',
  cancelamento_solicitado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  delivery_fee numeric,
  delivery_free_above numeric,
  delivery_max_km numeric,
  store_geo_lat numeric,
  store_geo_lng numeric,
  auto_accept_orders boolean NOT NULL DEFAULT false,
  manual_closed boolean NOT NULL DEFAULT false,
  business_hours jsonb,
  auto_notify_new_order boolean NOT NULL DEFAULT true,
  salao_attendance_mode text,
  theme_id text,
  logo_url text,
  cover_url text,
  pix_enabled boolean NOT NULL DEFAULT false,
  pix_key_type varchar(20),
  pix_key varchar(255),
  pix_receiver_name varchar(255),
  pix_receiver_city varchar(255),
  contrato_inicio_em date,
  contrato_fim_em date,
  contrato_mensal_brl numeric,
  contrato_desconto_pct numeric,
  contrato_aceite_em timestamptz,
  contrato_assinatura_nome text,
  contrato_assinatura_png text,
  contrato_termos_versao text,
  contrato_aceite_por uuid,
  contrato_documento_tipo text,
  contrato_documento_numero text,
  contrato_representante_cargo text,
  contrato_documento_hash text,
  contrato_pdf_path text,
  contrato_aceite_ip text,
  contrato_aceite_user_agent text,
  contrato_aceite_email text,
  hub_pin_balcao_enabled boolean NOT NULL DEFAULT false,
  hub_pin_balcao text,
  hub_pin_salao_enabled boolean NOT NULL DEFAULT false,
  hub_pin_salao text,
  hub_pin_cozinha_enabled boolean NOT NULL DEFAULT false,
  hub_pin_cozinha text,
  hub_pin_admin_enabled boolean NOT NULL DEFAULT false,
  hub_pin_admin text,
  print_agent_token text,
  print_agent_url text,
  print_printer_ip text,
  print_printer_port integer,
  print_auto_delivery boolean,
  print_auto_autoatendimento boolean,
  print_auto_pdv boolean,
  print_auto_garcom boolean,
  print_include_customer_details boolean,
  print_delivery_copy boolean,
  print_paper_mm integer
);

CREATE UNIQUE INDEX IF NOT EXISTS stores_slug_unique_ci
  ON public.stores (lower(trim(slug)))
  WHERE slug IS NOT NULL AND trim(slug) <> '';

CREATE INDEX IF NOT EXISTS idx_stores_owner_id ON public.stores (owner_id);

-- ─── categories ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_store ON public.categories (store_id);

-- ─── products ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  price numeric NOT NULL DEFAULT 0,
  promotional_price numeric,
  promotion_active boolean NOT NULL DEFAULT false,
  delivery_price numeric,
  dine_in_price numeric,
  delivery_promotional_price numeric,
  delivery_promotion_active boolean NOT NULL DEFAULT false,
  dine_in_promotional_price numeric,
  dine_in_promotion_active boolean NOT NULL DEFAULT false,
  image_url text,
  active boolean NOT NULL DEFAULT true,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_store_active ON public.products (store_id, active);

-- ─── addon_groups / addon_items ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.addon_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  name text NOT NULL,
  min_select integer NOT NULL DEFAULT 0,
  max_select integer NOT NULL DEFAULT 1,
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.addon_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.addon_groups (id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0
);

-- ─── orders / order_items ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  customer_name text,
  customer_phone text,
  delivery_address text,
  delivery_fee numeric,
  payment_method text,
  payment_status varchar(50),
  pix_payload text,
  pix_paid_at timestamptz,
  notes text,
  total numeric NOT NULL DEFAULT 0,
  items_summary text,
  status text NOT NULL DEFAULT 'pending',
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  caixa_turno_id uuid,
  entregador_id uuid,
  entregador_nome text,
  entrega_despachada_em timestamptz,
  entrega_prazo_minutos integer NOT NULL DEFAULT 45,
  garcom_id uuid,
  garcom_nome text,
  service_fee_brl numeric
);

CREATE INDEX IF NOT EXISTS idx_orders_store_created ON public.orders (store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  product_id uuid,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items (order_id);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

SELECT pg_notify('pgrst', 'reload schema');
