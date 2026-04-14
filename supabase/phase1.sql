-- Fase 1: quotas de importação por foto + Realtime em `orders`
-- Executar no SQL Editor do Supabase (projeto Vyria).

-- 1) Uso mensal de importação por loja
create table if not exists public.store_menu_import_usage (
  store_id uuid not null references public.stores (id) on delete cascade,
  year_month text not null,
  count integer not null default 0,
  primary key (store_id, year_month),
  constraint store_menu_import_usage_ym_chk check (
    year_month ~ '^\d{4}-\d{2}$'
  )
);

alter table public.store_menu_import_usage enable row level security;

drop policy if exists "store_menu_import_usage_select" on public.store_menu_import_usage;
drop policy if exists "store_menu_import_usage_modify" on public.store_menu_import_usage;

create policy "store_menu_import_usage_select" on public.store_menu_import_usage
  for select using (
    exists (
      select 1 from public.stores s
      where s.id = store_menu_import_usage.store_id
        and s.owner_id = (select auth.uid())
    )
  );

create policy "store_menu_import_usage_modify" on public.store_menu_import_usage
  for all using (
    exists (
      select 1 from public.stores s
      where s.id = store_menu_import_usage.store_id
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.stores s
      where s.id = store_menu_import_usage.store_id
        and s.owner_id = (select auth.uid())
    )
  );

-- Incremento atómico (chamado pela API após IA OK)
create or replace function public.increment_store_menu_import_usage(
  p_store_id uuid,
  p_ym text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.stores where id = p_store_id and owner_id = uid
  ) then
    raise exception 'forbidden';
  end if;
  insert into public.store_menu_import_usage (store_id, year_month, count)
  values (p_store_id, p_ym, 1)
  on conflict (store_id, year_month)
  do update set count = public.store_menu_import_usage.count + 1
  returning count into n;
  return n;
end;
$$;

grant execute on function public.increment_store_menu_import_usage(uuid, text) to authenticated;

-- 2) Realtime: pedidos novos/atualizados no painel (Replication já deve estar ON para a tabela)
alter publication supabase_realtime add table public.orders;
