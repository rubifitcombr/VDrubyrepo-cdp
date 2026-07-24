  -- Exportação manual (plano Free, sem backup)
  -- Supabase Dashboard → projeto ANTIGO → SQL Editor → Run cada bloco.
  -- Se um bloco responder em < 10s, copia o JSON e guarda em .migration-export/<tabela>.json

  -- 0) Diagnóstico rápido
  SELECT 'stores' AS t, count(*)::int AS n FROM public.stores
  UNION ALL SELECT 'products', count(*)::int FROM public.products
  UNION ALL SELECT 'orders', count(*)::int FROM public.orders
  UNION ALL SELECT 'auth.users', count(*)::int FROM auth.users
  UNION ALL SELECT 'usuarios', count(*)::int FROM public.usuarios;

  -- 1) Exportar lojas (copiar resultado JSON — guardar como .migration-export/stores.json)
  --    O campo "data" do resultado: se vier embrulhado em { data: [...] }, usa só o array.
  SELECT coalesce(json_agg(row_to_json(s)), '[]'::json) AS data
  FROM (SELECT * FROM public.stores ORDER BY created_at NULLS LAST) s;

  -- 2) Utilizadores Auth (sem password — só metadados; passwords precisam reset ou pg_dump)
  SELECT coalesce(json_agg(row_to_json(u)), '[]'::json) AS data
  FROM (
    SELECT id, email, raw_user_meta_data, raw_app_meta_data, created_at, email_confirmed_at
    FROM auth.users
    ORDER BY created_at
  ) u;

  -- 3) Espelho usuarios
  SELECT coalesce(json_agg(row_to_json(u)), '[]'::json) AS data
  FROM (SELECT * FROM public.usuarios ORDER BY created_at) u;

  -- 4) Produtos
  SELECT coalesce(json_agg(row_to_json(p)), '[]'::json) AS data
  FROM (SELECT * FROM public.products ORDER BY store_id, name) p;

  -- 5) Pedidos (últimos 90 dias — ajuste se precisar de histórico completo)
  SELECT coalesce(json_agg(row_to_json(o)), '[]'::json) AS data
  FROM (
    SELECT * FROM public.orders
    WHERE created_at > now() - interval '90 days'
    ORDER BY created_at
  ) o;

  -- 6) Itens de pedidos (mesmo período)
  SELECT coalesce(json_agg(row_to_json(oi)), '[]'::json) AS data
  FROM (
    SELECT oi.* FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.created_at > now() - interval '90 days'
  ) oi;

  -- Repetir padrão para outras tabelas se necessário:
  -- addon_groups, addon_items, store_entregadores, suppliers, financial_entries, faturas, etc.
