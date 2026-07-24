-- Cole no Supabase Dashboard → SQL Editor (antes de criar índices).
-- Mostra índices/constraints em public.stores e public.products.

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('stores', 'products')
ORDER BY tablename, indexname;

SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.stores'::regclass
ORDER BY conname;

-- Teste rápido (deve responder em < 1s após índices / restart)
SELECT id, slug, status
FROM public.stores
WHERE lower(trim(slug)) = lower(trim('donna-cereja'))
LIMIT 1;
