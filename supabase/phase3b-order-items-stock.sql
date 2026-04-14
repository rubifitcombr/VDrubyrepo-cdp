-- Baixa automática de estoque ao inserir linhas em `order_items`.
-- Executar no SQL Editor do Supabase após phase3.sql (tabela `store_product_stock`).
--
-- Regras:
-- - Só altera stock se existir linha em `store_product_stock` para (loja, produto).
-- - Produtos sem registo de estoque não bloqueiam o pedido (comportamento anterior).
-- - Usa FOR UPDATE para evitar corridas entre pedidos simultâneos.

create or replace function public.tr_order_items_stock_before_ins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  st uuid;
  cur int;
  need int;
  pname text;
begin
  select o.store_id into st
  from public.orders o
  where o.id = new.order_id;

  if st is null then
    raise exception 'Pedido inválido.';
  end if;

  if not exists (
    select 1 from public.products p
    where p.id = new.product_id and p.store_id = st
  ) then
    raise exception 'Produto inválido neste pedido.';
  end if;

  select s.quantity into cur
  from public.store_product_stock s
  where s.store_id = st and s.product_id = new.product_id
  for update;

  if not found then
    return new;
  end if;

  need := greatest(1, new.quantity);
  if cur < need then
    select coalesce(p.name, 'Produto') into pname
    from public.products p
    where p.id = new.product_id;
    raise exception 'Estoque insuficiente para "%".', pname;
  end if;

  update public.store_product_stock
  set
    quantity = quantity - need,
    updated_at = now()
  where store_id = st and product_id = new.product_id;

  return new;
end;
$$;

drop trigger if exists order_items_stock_before_ins on public.order_items;

create trigger order_items_stock_before_ins
  before insert on public.order_items
  for each row
  execute function public.tr_order_items_stock_before_ins();

-- Opcional: phase3c-order-cancel-restore-stock.sql — repõe stock ao cancelar pedido.
