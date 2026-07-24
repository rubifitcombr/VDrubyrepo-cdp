-- Diagnóstico: Postgres a não responder (queries REST/RPC em timeout).
-- Supabase Dashboard → SQL → New query → Run

-- 1) Sessões activas e bloqueios
SELECT
  pid,
  usename,
  state,
  wait_event_type,
  wait_event,
  now() - query_start AS running_for,
  left(query, 200) AS query_preview
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
ORDER BY query_start NULLS LAST;

-- 2) Locks em espera
SELECT
  blocked_locks.pid AS blocked_pid,
  blocking_locks.pid AS blocking_pid,
  left(blocked_activity.query, 120) AS blocked_query,
  left(blocking_activity.query, 120) AS blocking_query
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
  AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
  AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
  AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
  AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
  AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
  AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
  AND blocking_locks.pid <> blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

-- 3) Teste rápido na tabela stores (deve responder em < 1s)
SELECT id, slug, status FROM public.stores WHERE slug = 'donna-cereja' LIMIT 1;

-- Se o passo 3 também travar: Settings → Infrastructure → Restart project
-- ou terminar o PID bloqueador (só se souberes o que é):
-- SELECT pg_terminate_backend(<blocking_pid>);
