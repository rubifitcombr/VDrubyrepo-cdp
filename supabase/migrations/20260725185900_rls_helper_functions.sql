-- Funções base de RLS usadas em migrations posteriores (pedidos, produtos, Master, etc.).
-- Idempotente — CREATE OR REPLACE.

-- ---------------------------------------------------------------------------
-- auth_owns_store — dono autenticado da loja
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_owns_store(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id = p_store_id
      AND s.owner_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- store_owner_can_operate — dono + loja ativa (escrita operacional)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_owner_can_operate(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id = p_store_id
      AND s.owner_id = auth.uid()
      AND lower(trim(coalesce(
        nullif(s.status::text, ''),
        nullif(s.merchant_status::text, ''),
        'pendente'
      ))) = 'ativo'
  );
$$;

-- ---------------------------------------------------------------------------
-- store_plan_tier — tier comercial (0=start … 3=master)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_plan_tier(p_store_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN lower(trim(coalesce(nullif(s.plano::text, ''), nullif(s.plan::text, ''), 'start'))) = 'master' THEN 3
    WHEN lower(trim(coalesce(nullif(s.plano::text, ''), nullif(s.plan::text, ''), 'start'))) = 'pro' THEN 2
    WHEN lower(trim(coalesce(nullif(s.plano::text, ''), nullif(s.plan::text, ''), 'start'))) IN ('growth') THEN 1
    ELSE 0
  END
  FROM public.stores s
  WHERE s.id = p_store_id
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- store_plan_tier_at_least — compara tier mínimo exigido pelo recurso
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_plan_tier_at_least(p_store_id uuid, p_min_tier integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(public.store_plan_tier(p_store_id), 0) >= coalesce(p_min_tier, 0);
$$;

GRANT EXECUTE ON FUNCTION public.auth_owns_store(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_owner_can_operate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_plan_tier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_plan_tier_at_least(uuid, integer) TO authenticated;
