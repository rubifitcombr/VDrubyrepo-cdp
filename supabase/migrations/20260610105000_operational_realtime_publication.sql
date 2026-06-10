DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    IF to_regclass('public.orders') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'orders'
      )
    THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;

    IF to_regclass('public.caixas_turnos') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'caixas_turnos'
      )
    THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.caixas_turnos;
    END IF;

    IF to_regclass('public.caixa_movimentacoes') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'caixa_movimentacoes'
      )
    THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.caixa_movimentacoes;
    END IF;

    IF to_regclass('public.store_tables') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'store_tables'
      )
    THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.store_tables;
    END IF;
  END IF;
END $$;
