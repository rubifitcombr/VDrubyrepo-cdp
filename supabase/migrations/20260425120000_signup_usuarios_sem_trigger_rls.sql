-- Corrige "Database error saving new user": remove o trigger em auth.users que falha
-- e passa o espelho public.usuarios para a app (registo + políticas RLS).
--
-- Executar no Supabase → SQL Editor (uma vez). Depois: git pull / copiar do repo.

-- Se `usuarios` for VIEW (relíquia), REMOVE antes: RLS só aplica a tabela base.
DO $drop_usuarios_view$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'usuarios' AND c.relkind = 'm'
  ) THEN
    EXECUTE 'DROP MATERIALIZED VIEW IF EXISTS public.usuarios CASCADE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'usuarios' AND c.relkind = 'v'
  ) THEN
    EXECUTE 'DROP VIEW IF EXISTS public.usuarios CASCADE';
  END IF;
END $drop_usuarios_view$;

-- Copia o bloco inteiro; em Postgres o "(" tem de vir logo após usuarios (senão erro "near id").
CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usuarios_pkey PRIMARY KEY (id),
  CONSTRAINT usuarios_id_fkey FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE
);

ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE public.usuarios
SET created_at = coalesce(created_at, now())
WHERE created_at IS NULL;

ALTER TABLE public.usuarios ALTER COLUMN created_at SET DEFAULT now();

-- Remove trigger/função que rebenta o INSERT em auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Só o próprio utilizador autenticado gere a sua linha (a app faz upsert após signUp)
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

-- authenticated precisa de USAGE no schema public (senão o upsert da app pode falhar)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.usuarios TO authenticated;

COMMENT ON TABLE public.usuarios IS
  'Espelho id/email por utilizador; preenchido pela app após registo (sem trigger em auth.users).';
