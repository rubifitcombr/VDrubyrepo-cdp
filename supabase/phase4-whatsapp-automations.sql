-- Fase 4: automação simples de resposta no WhatsApp por loja (Growth+)
-- Executar no SQL Editor do Supabase.

create table if not exists public.whatsapp_automations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  is_active boolean not null default false,
  message_template text not null default 'Olá 👋 faça seu pedido aqui: {link}',
  delay_seconds integer not null default 3,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now(),
  constraint whatsapp_automations_delay_chk check (delay_seconds >= 0 and delay_seconds <= 300),
  constraint whatsapp_automations_store_unique unique (store_id)
);

alter table public.whatsapp_automations enable row level security;

drop policy if exists "whatsapp_automations_rw" on public.whatsapp_automations;

create policy "whatsapp_automations_rw" on public.whatsapp_automations
  for all using (
    exists (
      select 1 from public.stores s
      where s.id = whatsapp_automations.store_id
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.stores s
      where s.id = whatsapp_automations.store_id
        and s.owner_id = (select auth.uid())
    )
  );

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_whatsapp_automations_updated_at on public.whatsapp_automations;

create trigger trg_whatsapp_automations_updated_at
before update on public.whatsapp_automations
for each row execute function public.set_updated_at_timestamp();
