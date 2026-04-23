-- public.usuarios era VIEW: RLS e upsert do PostgREST exigem TABELA.
-- 1) Renomeia view (ou materialized view)  2) Cria tabela  3) Copia dados
-- 4) RLS + grants  5) Remove view backup
-- Opcional no fim: remove triggers problemáticos em auth.users (mesmo bloco
-- que 20260425120000_signup_usuarios_sem_trigger_rls.sql).

-- A) Libertar o nome "usuarios" se for view/materialized view
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'usuarios'
      AND c.relkind = 'v'
  ) THEN
    ALTER VIEW public.usuarios RENAME TO _usuarios_backup_view;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'usuarios'
      AND c.relkind = 'm'
  ) THEN
    ALTER MATERIALIZED VIEW public.usuarios RENAME TO _usuarios_backup_mview;
  END IF;
END $$;

-- B) Tabela física (mínimo: id + email, como no teu projeto)
CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text
);

ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS email text;

-- C) Dados a partir do backup da view (só linhas com id válido em auth.users)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = '_usuarios_backup_view'
  ) THEN
    INSERT INTO public.usuarios (id, email)
    SELECT b.id, b.email::text
    FROM public._usuarios_backup_view b
    INNER JOIN auth.users au ON au.id = b.id
    ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(EXCLUDED.email, public.usuarios.email);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = '_usuarios_backup_mview'
  ) THEN
    INSERT INTO public.usuarios (id, email)
    SELECT m.id, m.email::text
    FROM public._usuarios_backup_mview m
    INNER JOIN auth.users au ON au.id = m.id
    ON CONFLICT (id) DO UPDATE
    SET email = COALESCE(EXCLUDED.email, public.usuarios.email);
  END IF;
END $$;

-- D) Sincronizar todos os utilizadores em auth (garante linhas em falta)
INSERT INTO public.usuarios (id, email)
SELECT au.id, au.email::text
FROM auth.users au
ON CONFLICT (id) DO UPDATE
SET email = COALESCE(EXCLUDED.email, public.usuarios.email);

-- E) Remover backups deixados pelo rename
DROP VIEW IF EXISTS public._usuarios_backup_view;
DROP MATERIALIZED VIEW IF EXISTS public._usuarios_backup_mview;

COMMENT ON TABLE public.usuarios IS 'Espelho de utilizadores; preenchido pelo app (upsert). Antes era view — agora tabela com RLS.';

-- F) RLS
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios TO authenticated;
GRANT ALL ON public.usuarios TO service_role;

-- G) Opcional: evita "Database error saving new user" por trigger em auth.users
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
