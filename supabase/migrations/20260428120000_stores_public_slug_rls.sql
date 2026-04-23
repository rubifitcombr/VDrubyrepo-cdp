-- Cardápio público /[slug]: leitura de `stores` com a chave anon (visitante sem sessão).
-- Sem isto, se SUPABASE_SERVICE_ROLE_KEY não estiver no deploy, a página devolve 404.
-- Inclui políticas mínimas de dono para INSERT/UPDATE/DELETE após ativar RLS.

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vyria_stores_public_select_anon ON public.stores;
DROP POLICY IF EXISTS vyria_stores_public_select_authenticated ON public.stores;
DROP POLICY IF EXISTS vyria_stores_owner_insert ON public.stores;
DROP POLICY IF EXISTS vyria_stores_owner_update ON public.stores;
DROP POLICY IF EXISTS vyria_stores_owner_delete ON public.stores;

CREATE POLICY vyria_stores_public_select_anon ON public.stores
  FOR SELECT TO anon
  USING (true);

CREATE POLICY vyria_stores_public_select_authenticated ON public.stores
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY vyria_stores_owner_insert ON public.stores
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY vyria_stores_owner_update ON public.stores
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY vyria_stores_owner_delete ON public.stores
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

GRANT SELECT ON public.stores TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.stores TO authenticated;
