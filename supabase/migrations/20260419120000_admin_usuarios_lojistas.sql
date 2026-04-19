-- Admin Vyria: perfis de utilizador, estado de lojista e auditoria.
-- Executar via Supabase CLI ou colar no SQL Editor.

-- 1) Tabela de perfis (1 linha por utilizador auth)
CREATE TABLE IF NOT EXISTS public.usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'lojista',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_role ON public.usuarios (role);

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_select_own" ON public.usuarios;
CREATE POLICY "usuarios_select_own"
  ON public.usuarios FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "usuarios_update_own" ON public.usuarios;
CREATE POLICY "usuarios_update_own"
  ON public.usuarios FOR UPDATE
  USING (auth.uid() = id);

-- 2) Colunas de assinatura / estado do lojista na loja
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS merchant_status VARCHAR(20) NOT NULL DEFAULT 'pendente';

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS plano_vence_em DATE;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS plano_ativado_em TIMESTAMPTZ;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS plano_atualizado_em TIMESTAMPTZ;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_stores_merchant_status ON public.stores (merchant_status);
CREATE INDEX IF NOT EXISTS idx_stores_plano_vence ON public.stores (plano_vence_em);

COMMENT ON COLUMN public.stores.merchant_status IS 'pendente | ativo | bloqueado | cancelado';

-- 3) Log de ações admin
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  lojista_id UUID NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  acao VARCHAR(50) NOT NULL,
  detalhes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_lojista ON public.admin_logs (lojista_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_criado ON public.admin_logs (criado_em DESC);

-- 4) Sincronizar novos utilizadores auth -> usuarios
CREATE OR REPLACE FUNCTION public.handle_new_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, role)
  VALUES (NEW.id, NEW.email, 'lojista')
  ON CONFLICT (id) DO UPDATE SET email = COALESCE(EXCLUDED.email, public.usuarios.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_usuario ON auth.users;
CREATE TRIGGER on_auth_user_created_usuario
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_usuario();
