-- RLS do Financeiro do Caixa (suppliers / financial_entries).
-- As tabelas tinham RLS ativa sem políticas de escrita, o que fazia o
-- lojista receber "new row violates row-level security policy" ao salvar
-- um novo fornecedor ou lançamento. Aqui limitamos o acesso do lojista
-- autenticado (browser) APENAS à própria loja. Service-role ignora RLS.

alter table public.suppliers enable row level security;
alter table public.financial_entries enable row level security;

-- suppliers -------------------------------------------------------------------
drop policy if exists suppliers_owner_sel on public.suppliers;
create policy suppliers_owner_sel on public.suppliers
  for select using (
    store_id in (select id from public.stores where owner_id = auth.uid())
  );

drop policy if exists suppliers_owner_ins on public.suppliers;
create policy suppliers_owner_ins on public.suppliers
  for insert with check (
    store_id in (select id from public.stores where owner_id = auth.uid())
  );

drop policy if exists suppliers_owner_upd on public.suppliers;
create policy suppliers_owner_upd on public.suppliers
  for update using (
    store_id in (select id from public.stores where owner_id = auth.uid())
  ) with check (
    store_id in (select id from public.stores where owner_id = auth.uid())
  );

drop policy if exists suppliers_owner_del on public.suppliers;
create policy suppliers_owner_del on public.suppliers
  for delete using (
    store_id in (select id from public.stores where owner_id = auth.uid())
  );

-- financial_entries -----------------------------------------------------------
drop policy if exists financial_entries_owner_sel on public.financial_entries;
create policy financial_entries_owner_sel on public.financial_entries
  for select using (
    store_id in (select id from public.stores where owner_id = auth.uid())
  );

drop policy if exists financial_entries_owner_ins on public.financial_entries;
create policy financial_entries_owner_ins on public.financial_entries
  for insert with check (
    store_id in (select id from public.stores where owner_id = auth.uid())
  );

drop policy if exists financial_entries_owner_upd on public.financial_entries;
create policy financial_entries_owner_upd on public.financial_entries
  for update using (
    store_id in (select id from public.stores where owner_id = auth.uid())
  ) with check (
    store_id in (select id from public.stores where owner_id = auth.uid())
  );

drop policy if exists financial_entries_owner_del on public.financial_entries;
create policy financial_entries_owner_del on public.financial_entries
  for delete using (
    store_id in (select id from public.stores where owner_id = auth.uid())
  );

select pg_notify('pgrst', 'reload schema');
