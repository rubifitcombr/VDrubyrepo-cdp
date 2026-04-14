-- Devolução de estoque ao cancelar pedido (status → cancelled).
-- Executar no SQL Editor do Supabase após phase3b-order-items-stock.sql
--
-- Regras:
-- - Só corre quando o status passa a 'cancelled' (não repõe duas vezes).
-- - Só soma em linhas existentes em store_product_stock (alinhado à baixa na phase3b).

create or replace function public.tr_orders_restore_stock_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  st uuid;
begin
  if new.status is distinct from 'cancelled' then
    return new;
  end if;
  if old.status is not distinct from 'cancelled' then
    return new;
  end if;

  st := new.store_id;
  if st is null then
    return new;
  end if;

  update public.store_product_stock s
  set
    quantity = s.quantity + agg.qty,
    updated_at = now()
  from (
    select product_id, sum(greatest(1, quantity))::int as qty
    from public.order_items
    where order_id = new.id
    group by product_id
  ) agg
  where s.store_id = st
    and s.product_id = agg.product_id;

  return new;
end;
$$;

drop trigger if exists orders_restore_stock_after_cancel on public.orders;

create trigger orders_restore_stock_after_cancel
  after update of status on public.orders
  for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function public.tr_orders_restore_stock_on_cancel();
