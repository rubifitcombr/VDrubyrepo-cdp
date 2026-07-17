-- Corrige "Database error saving new user" no registo.
-- Triggers antigos em auth.users (handle_new_user / handle_new_usuario) abortavam
-- o INSERT quando public.usuarios falhava (RLS, VIEW, coluna em falta, etc.).
--
-- Esta migração:
-- 1) remove funções/triggers quebrados
-- 2) garante a tabela public.usuarios
-- 3) cria trigger TOLERANTE (erro em usuarios NÃO impede o registo Auth)
-- 4) RLS para o próprio utilizador + grants ao auth admin
--
-- Idempotente — seguro correr no SQL Editor do Supabase.

-- 1) Remover triggers/funções legados -----------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_usuario ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_usuario() CASCADE;

-- 2) Tabela public.usuarios ----------------------------------------------------
-- Se existir uma VIEW com o mesmo nome, remove-a antes de criar a tabela.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'usuarios'
  ) THEN
    DROP VIEW public.usuarios CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  role varchar(20) NOT NULL DEFAULT 'lojista',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS role varchar(20);
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE public.usuarios
SET
  role = coalesce(nullif(trim(role), ''), 'lojista'),
  created_at = coalesce(created_at, now())
WHERE role IS NULL OR created_at IS NULL;

ALTER TABLE public.usuarios ALTER COLUMN role SET DEFAULT 'lojista';
ALTER TABLE public.usuarios ALTER COLUMN created_at SET DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'usuarios'
      AND column_name = 'role' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.usuarios ALTER COLUMN role SET NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'usuarios'
      AND column_name = 'created_at' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.usuarios ALTER COLUMN created_at SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_usuarios_role ON public.usuarios (role);

-- 3) Trigger tolerante ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    INSERT INTO public.usuarios (id, email, role)
    VALUES (NEW.id, NEW.email, 'lojista')
    ON CONFLICT (id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, public.usuarios.email);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_usuario: % (user=%)', SQLERRM, NEW.id::text;
  END;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_usuario() IS
  'Espelha auth.users → public.usuarios; erros NÃO abortam o registo Auth.';

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT, INSERT, UPDATE ON TABLE public.usuarios TO supabase_auth_admin;
REVOKE ALL ON FUNCTION public.handle_new_usuario() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_usuario() TO supabase_auth_admin;

CREATE TRIGGER on_auth_user_created_usuario
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_usuario();

-- 4) RLS para a app (upsert após signUp / sync-usuario) ------------------------
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuarios_select_own" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_insert_own" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update_own" ON public.usuarios;

CREATE POLICY "usuarios_select_own"
  ON public.usuarios FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "usuarios_insert_own"
  ON public.usuarios FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "usuarios_update_own"
  ON public.usuarios FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

GRANT SELECT, INSERT, UPDATE ON TABLE public.usuarios TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

COMMENT ON TABLE public.usuarios IS
  'Espelho id/email/role por utilizador Auth. Trigger tolerante + sync pela app.';

SELECT pg_notify('pgrst', 'reload schema');
