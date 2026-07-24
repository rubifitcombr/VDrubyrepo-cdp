-- Exportação FOCADA — 6 lojistas Vyria
-- Projeto ANTIGO → SQL Editor → bloco a bloco → guardar JSON em .migration-export/
--
-- Lojistas: Secret Garden Cafe, Sanduicheria Zero62, Sanduicheria Tudibom,
--           rubiadmin, Dona Cereja, Arcano
--
-- Se o bloco 0 não responder em 15s, o Postgres está inacessível — só suporte Supabase.

-- 0) Encontrar lojas (ajusta slugs se o resultado vier vazio)
SELECT id, name, slug, owner_id, status, plano, plano_vence_em
FROM public.stores
WHERE lower(coalesce(slug, '')) IN (
  'secret-garden-cafe',
  'secret-garden',
  'sanduicheria-zero62',
  'zero62',
  'sanduicheria-tudibom',
  'tudibom',
  'rubiadmin',
  'donna-cereja',
  'dona-cereja',
  'arcano',
  'arcano-digital'
)
OR lower(name) LIKE '%secret garden%'
OR lower(name) LIKE '%zero62%'
OR lower(name) LIKE '%tudibom%'
OR lower(name) LIKE '%rubiadmin%'
OR lower(name) LIKE '%dona cereja%'
OR lower(name) LIKE '%donna cereja%'
OR lower(name) LIKE '%arcano%'
ORDER BY name;

-- CTE reutilizável (copiar IDs do bloco 0 se precisares ajustar manualmente)
-- Substitua os UUIDs abaixo pelos id reais devolvidos no bloco 0:
/*
WITH target_stores AS (
  SELECT id FROM public.stores WHERE id IN (
    'uuid-loja-1', 'uuid-loja-2'
  )
)
*/

-- 1) stores.json — array de lojas
SELECT coalesce(json_agg(row_to_json(s)), '[]'::json) AS data
FROM public.stores s
WHERE s.id IN (
  SELECT st.id FROM public.stores st
  WHERE lower(coalesce(st.slug, '')) IN (
    'secret-garden-cafe','secret-garden','sanduicheria-zero62','zero62',
    'sanduicheria-tudibom','tudibom','rubiadmin','donna-cereja','dona-cereja','arcano','arcano-digital'
  )
  OR lower(st.name) LIKE '%secret garden%'
  OR lower(st.name) LIKE '%zero62%'
  OR lower(st.name) LIKE '%tudibom%'
  OR lower(st.name) LIKE '%rubiadmin%'
  OR lower(st.name) LIKE '%dona cereja%'
  OR lower(st.name) LIKE '%donna cereja%'
  OR lower(st.name) LIKE '%arcano%'
);

-- 2) auth_users.json — donos das lojas (id + email)
SELECT coalesce(json_agg(row_to_json(u)), '[]'::json) AS data
FROM (
  SELECT DISTINCT au.id, au.email, au.raw_user_meta_data, au.raw_app_meta_data, au.created_at
  FROM auth.users au
  JOIN public.stores st ON st.owner_id = au.id
  WHERE st.id IN (
    SELECT id FROM public.stores
    WHERE lower(coalesce(slug, '')) IN (
      'secret-garden-cafe','secret-garden','sanduicheria-zero62','zero62',
      'sanduicheria-tudibom','tudibom','rubiadmin','donna-cereja','dona-cereja','arcano','arcano-digital'
    )
    OR lower(name) LIKE '%secret garden%' OR lower(name) LIKE '%zero62%'
    OR lower(name) LIKE '%tudibom%' OR lower(name) LIKE '%rubiadmin%'
    OR lower(name) LIKE '%dona cereja%' OR lower(name) LIKE '%donna cereja%'
    OR lower(name) LIKE '%arcano%'
  )
) u;

-- 3) usuarios.json
SELECT coalesce(json_agg(row_to_json(u)), '[]'::json) AS data
FROM public.usuarios u
WHERE u.id IN (
  SELECT owner_id FROM public.stores
  WHERE lower(coalesce(slug, '')) IN (
    'secret-garden-cafe','secret-garden','sanduicheria-zero62','zero62',
    'sanduicheria-tudibom','tudibom','rubiadmin','donna-cereja','dona-cereja','arcano','arcano-digital'
  )
  OR lower(name) LIKE '%secret garden%' OR lower(name) LIKE '%zero62%'
  OR lower(name) LIKE '%tudibom%' OR lower(name) LIKE '%rubiadmin%'
  OR lower(name) LIKE '%dona cereja%' OR lower(name) LIKE '%donna cereja%'
  OR lower(name) LIKE '%arcano%'
);

-- 4) products.json
SELECT coalesce(json_agg(row_to_json(p)), '[]'::json) AS data
FROM public.products p
WHERE p.store_id IN (
  SELECT id FROM public.stores
  WHERE lower(coalesce(slug, '')) IN (
    'secret-garden-cafe','secret-garden','sanduicheria-zero62','zero62',
    'sanduicheria-tudibom','tudibom','rubiadmin','donna-cereja','dona-cereja','arcano','arcano-digital'
  )
  OR lower(name) LIKE '%secret garden%' OR lower(name) LIKE '%zero62%'
  OR lower(name) LIKE '%tudibom%' OR lower(name) LIKE '%rubiadmin%'
  OR lower(name) LIKE '%dona cereja%' OR lower(name) LIKE '%donna cereja%'
  OR lower(name) LIKE '%arcano%'
);

-- 5) orders.json (todos os pedidos dessas lojas)
SELECT coalesce(json_agg(row_to_json(o)), '[]'::json) AS data
FROM public.orders o
WHERE o.store_id IN (
  SELECT id FROM public.stores
  WHERE lower(coalesce(slug, '')) IN (
    'secret-garden-cafe','secret-garden','sanduicheria-zero62','zero62',
    'sanduicheria-tudibom','tudibom','rubiadmin','donna-cereja','dona-cereja','arcano','arcano-digital'
  )
  OR lower(name) LIKE '%secret garden%' OR lower(name) LIKE '%zero62%'
  OR lower(name) LIKE '%tudibom%' OR lower(name) LIKE '%rubiadmin%'
  OR lower(name) LIKE '%dona cereja%' OR lower(name) LIKE '%donna cereja%'
  OR lower(name) LIKE '%arcano%'
);

-- 6) order_items.json
SELECT coalesce(json_agg(row_to_json(oi)), '[]'::json) AS data
FROM public.order_items oi
WHERE oi.order_id IN (
  SELECT o.id FROM public.orders o
  WHERE o.store_id IN (
    SELECT id FROM public.stores
    WHERE lower(coalesce(slug, '')) IN (
      'secret-garden-cafe','secret-garden','sanduicheria-zero62','zero62',
      'sanduicheria-tudibom','tudibom','rubiadmin','donna-cereja','dona-cereja','arcano','arcano-digital'
    )
    OR lower(name) LIKE '%secret garden%' OR lower(name) LIKE '%zero62%'
    OR lower(name) LIKE '%tudibom%' OR lower(name) LIKE '%rubiadmin%'
    OR lower(name) LIKE '%dona cereja%' OR lower(name) LIKE '%donna cereja%'
    OR lower(name) LIKE '%arcano%'
  )
);

-- 7) addon_groups + addon_items (se existirem)
SELECT coalesce(json_agg(row_to_json(g)), '[]'::json) AS data
FROM public.addon_groups g
WHERE g.store_id IN (
  SELECT id FROM public.stores
  WHERE lower(name) LIKE '%secret garden%' OR lower(name) LIKE '%zero62%'
  OR lower(name) LIKE '%tudibom%' OR lower(name) LIKE '%rubiadmin%'
  OR lower(name) LIKE '%dona cereja%' OR lower(name) LIKE '%donna cereja%'
  OR lower(name) LIKE '%arcano%'
  OR lower(coalesce(slug, '')) LIKE '%zero62%' OR lower(coalesce(slug, '')) LIKE '%tudibom%'
  OR lower(coalesce(slug, '')) LIKE '%cereja%' OR lower(coalesce(slug, '')) LIKE '%arcano%'
  OR lower(coalesce(slug, '')) LIKE '%secret%' OR lower(coalesce(slug, '')) LIKE '%rubiadmin%'
);

SELECT coalesce(json_agg(row_to_json(i)), '[]'::json) AS data
FROM public.addon_items i
WHERE i.group_id IN (
  SELECT g.id FROM public.addon_groups g
  WHERE g.store_id IN (
    SELECT id FROM public.stores
    WHERE lower(name) LIKE '%secret garden%' OR lower(name) LIKE '%zero62%'
    OR lower(name) LIKE '%tudibom%' OR lower(name) LIKE '%rubiadmin%'
    OR lower(name) LIKE '%dona cereja%' OR lower(name) LIKE '%donna cereja%'
    OR lower(name) LIKE '%arcano%'
  )
);

-- 8) store_entregadores, store_garcons (se existirem)
SELECT coalesce(json_agg(row_to_json(e)), '[]'::json) AS data
FROM public.store_entregadores e
WHERE e.store_id IN (SELECT id FROM public.stores WHERE lower(name) LIKE '%zero62%' OR lower(name) LIKE '%tudibom%' OR lower(name) LIKE '%cereja%' OR lower(name) LIKE '%secret garden%' OR lower(name) LIKE '%arcano%' OR lower(name) LIKE '%rubiadmin%');
