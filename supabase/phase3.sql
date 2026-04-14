-- Fase 3: gestão de estoque por produto (plano Master) + base para alertas
-- Executar no SQL Editor do Supabase após phase2.sql

create table if not exists public.store_product_stock (
  store_id uuid not null references public.stores (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity integer not null default 0,
  low_stock_alert integer null,
  updated_at timestamptz not null default now(),
  primary key (store_id, product_id),
  constraint store_product_stock_qty_chk check (quantity >= 0),
  constraint store_product_stock_low_chk check (
    low_stock_alert is null or low_stock_alert >= 0
  )
);

create index if not exists store_product_stock_store_idx
  on public.store_product_stock (store_id);

alter table public.store_product_stock enable row level security;

drop policy if exists "store_product_stock_select" on public.store_product_stock;
drop policy if exists "store_product_stock_write" on public.store_product_stock;

create policy "store_product_stock_select" on public.store_product_stock
  for select using (
    exists (
      select 1 from public.stores s
      where s.id = store_product_stock.store_id
        and s.owner_id = (select auth.uid())
    )
  );

create policy "store_product_stock_write" on public.store_product_stock
  for all using (
    exists (
      select 1 from public.stores s
      where s.id = store_product_stock.store_id
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.stores s
      where s.id = store_product_stock.store_id
        and s.owner_id = (select auth.uid())
    )
  );

-- Em seguida (opcional): phase3b-order-items-stock.sql (baixa ao registar itens),
-- depois phase3c-order-cancel-restore-stock.sql (devolução ao cancelar pedido).
