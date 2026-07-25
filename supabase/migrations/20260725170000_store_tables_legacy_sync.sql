-- Mantém nome/ativo (NOT NULL legado) alinhados com name/active.

CREATE OR REPLACE FUNCTION sync_store_tables_legacy_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.nome IS NULL OR btrim(NEW.nome) = '' THEN
    NEW.nome := COALESCE(NULLIF(btrim(NEW.name), ''), 'Mesa');
  END IF;
  IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
    NEW.name := NEW.nome;
  END IF;
  IF NEW.ativo IS NULL THEN
    NEW.ativo := COALESCE(NEW.active, true);
  END IF;
  IF NEW.active IS NULL THEN
    NEW.active := COALESCE(NEW.ativo, true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_store_tables_legacy ON public.store_tables;
CREATE TRIGGER trg_sync_store_tables_legacy
  BEFORE INSERT OR UPDATE ON public.store_tables
  FOR EACH ROW
  EXECUTE FUNCTION sync_store_tables_legacy_columns();
