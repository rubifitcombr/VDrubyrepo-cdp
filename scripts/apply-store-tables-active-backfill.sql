-- Backfill name/active a partir de nome/ativo (linhas legadas com active NULL
-- falhavam no filtro .eq('active', true) e esvaziavam o mapa de mesas).

UPDATE public.store_tables
SET
  name = COALESCE(NULLIF(btrim(name), ''), NULLIF(btrim(nome), ''), 'Mesa'),
  nome = COALESCE(NULLIF(btrim(nome), ''), NULLIF(btrim(name), ''), 'Mesa'),
  active = COALESCE(active, ativo, true),
  ativo = COALESCE(ativo, active, true),
  ambiente = COALESCE(NULLIF(btrim(ambiente), ''), 'Salão')
WHERE
  name IS NULL
  OR btrim(name) = ''
  OR active IS NULL
  OR ativo IS NULL
  OR ambiente IS NULL
  OR btrim(ambiente) = '';

SELECT pg_notify('pgrst', 'reload schema');
