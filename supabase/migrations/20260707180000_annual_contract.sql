-- Contrato anual (compromisso 12 meses, mensalidade com desconto) e multa por cancelamento antecipado.
-- Ver também supabase/annual-contract.sql (script único para o SQL Editor).

alter table stores add column if not exists billing_cycle text;
update stores set billing_cycle = 'monthly' where billing_cycle is null;
alter table stores alter column billing_cycle set default 'monthly';
alter table stores alter column billing_cycle set not null;

alter table stores add column if not exists contrato_inicio_em date;
alter table stores add column if not exists contrato_fim_em date;
alter table stores add column if not exists contrato_mensal_brl numeric;
alter table stores add column if not exists contrato_desconto_pct numeric;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stores_billing_cycle_check'
  ) then
    alter table stores
      add constraint stores_billing_cycle_check
      check (billing_cycle in ('monthly', 'annual'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'assinatura_cancelamentos'
  ) then
    alter table assinatura_cancelamentos
      add column if not exists multa_estimada_brl numeric;
    alter table assinatura_cancelamentos
      add column if not exists meses_restantes integer;
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
