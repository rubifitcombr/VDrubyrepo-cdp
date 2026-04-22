-- Espelha novos utilizadores em public.usuarios (corrige "Database error saving new user").
--
-- Causas frequentes no Supabase:
-- 1) Trigger em auth.users sem GRANT para supabase_auth_admin em schema public / tabela / função.
-- 2) Sintaxe EXECUTE FUNCTION (PG14+) vs EXECUTE PROCEDURE (docs Supabase / compat).
-- 3) RLS em public.usuarios a bloquear o insert do trigger.
--
-- Executar no SQL Editor (como postgres) ou `supabase db push`.

CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.usuarios IS
  'Espelho de emails por utilizador (auth); preenchido por trigger em auth.users.';

-- Instalações antigas: garantir colunas mínimas sem apagar dados
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE public.usuarios
SET created_at = coalesce(created_at, now())
WHERE created_at IS NULL;

ALTER TABLE public.usuarios ALTER COLUMN created_at SET DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usuarios'
      AND column_name = 'created_at'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.usuarios ALTER COLUMN created_at SET NOT NULL;
  END IF;
END $$;

-- O trigger corre no contexto Auth; RLS em usuarios costuma bloquear inserts.
ALTER TABLE public.usuarios DISABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuarios (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.usuarios.email);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Após INSERT em auth.users: garante linha em public.usuarios.';

-- O papel supabase_auth_admin precisa de acesso explícito fora de auth (documentação Supabase).
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT INSERT, UPDATE, SELECT ON TABLE public.usuarios TO supabase_auth_admin;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();
