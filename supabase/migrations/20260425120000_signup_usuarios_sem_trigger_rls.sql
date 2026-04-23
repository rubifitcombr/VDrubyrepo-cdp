-- Vyria Delivery: corrige signUp ("Database error saving new user")
-- Remove triggers em auth.users definidos em public (inserções em usuarios no
-- contexto errado). Garante public.usuarios + RLS para o cliente fazer upsert
-- (services/usuarios.ts) e fallback com service role (api/auth/sync-usuario).

-- 1) Remover triggers em auth.users cuja função está em public (típico: sync para usuarios)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT t.tgname AS name
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE t.tgrelid = 'auth.users'::regclass
      AND NOT t.tgisinternal
      AND n.nspname = 'public'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users', r.name);
  END LOOP;
END $$;

-- 2) Tabela espelho (id = auth.users.id, email — alinhado ao código)
CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON TABLE public.usuarios IS 'Espelho de utilizadores (email para admin); preenchido pelo app após signUp.';

-- 3) RLS: cada utilizador só gere a própria linha
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas com qualquer nome (re-execução segura)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT pol.polname AS name
    FROM pg_policy pol
    JOIN pg_class cls ON pol.polrelid = cls.oid
    JOIN pg_namespace nsp ON cls.relnamespace = nsp.oid
    WHERE nsp.nspname = 'public'
      AND cls.relname = 'usuarios'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.usuarios', r.name);
  END LOOP;
END $$;

CREATE POLICY usuarios_select_own ON public.usuarios
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY usuarios_insert_own ON public.usuarios
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY usuarios_update_own ON public.usuarios
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY usuarios_delete_own ON public.usuarios
  FOR DELETE TO authenticated
  USING (auth.uid() = id);

-- 4) Permissões para o cliente Supabase (JWT authenticated)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios TO authenticated;
GRANT ALL ON public.usuarios TO service_role;
