-- Realtime: itens de comanda (garçom adiciona produto sem mudar status).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    IF to_regclass('public.order_items') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'order_items'
      )
    THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
    END IF;
  END IF;
END $$;

SELECT pg_notify('pgrst', 'reload schema');
