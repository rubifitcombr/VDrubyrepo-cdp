-- Reparação: "Database error saving new user" (trigger em auth.users).
-- Idempotente. Correr no SQL Editor ou via `supabase db push` após migrações anteriores.
--
-- Inclui: remover função/trigger antigos, função com search_path vazio + INSERT qualificado,
-- bloco EXCEPTION (o registo Auth não falha se o insert em usuarios falhar — ver API sync-usuario),
-- grants para supabase_auth_admin.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

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

ALTER TABLE public.usuarios DISABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    INSERT INTO public.usuarios (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, public.usuarios.email);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user usuarios: % (user=%)', SQLERRM, NEW.id::text;
  END;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Após INSERT em auth.users: espelha em public.usuarios (erros não abortam o registo Auth).';

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT INSERT, UPDATE, SELECT ON TABLE public.usuarios TO supabase_auth_admin;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();
