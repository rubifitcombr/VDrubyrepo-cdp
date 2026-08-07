-- Concorrência: uma comanda aberta por nome em cada mesa do salão (garçom / QR)

CREATE UNIQUE INDEX IF NOT EXISTS orders_salon_open_comanda_name_uidx
  ON public.orders (
    store_id,
    salon_table_id,
    lower(btrim(salon_table_sector)),
    lower(btrim(customer_name))
  )
  WHERE source IN ('waiter', 'autoatendimento')
    AND status IN ('pending', 'preparing', 'ready', 'confirmed')
    AND salon_table_id IS NOT NULL
    AND customer_name IS NOT NULL
    AND btrim(customer_name) <> '';
