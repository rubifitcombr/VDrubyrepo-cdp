-- Espelha novos utilizadores em public.usuarios (evita falha no registo Auth:
-- mensagem "Database error saving new user" quando o trigger INSERT falha ou a tabela não existe).
-- Executar no Supabase (SQL Editor ou `supabase db push`) DEPOIS das migrações base em stores/usuarios.

CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.usuarios IS
  'Espelho de emails por utilizador (auth); preenchido por trigger em auth.users.';

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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
