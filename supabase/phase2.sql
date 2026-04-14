-- Fase 2: quotas de marketing IA (Pro vs Master) + opcional
-- Executar no SQL Editor do Supabase após phase1.sql (depois phase3.sql para estoque)

create table if not exists public.store_marketing_ai_usage (
  store_id uuid not null references public.stores (id) on delete cascade,
  year_month text not null,
  description_count integer not null default 0,
  image_count integer not null default 0,
  primary key (store_id, year_month),
  constraint store_marketing_ai_usage_ym_chk check (year_month ~ '^\d{4}-\d{2}$')
);

alter table public.store_marketing_ai_usage enable row level security;

drop policy if exists "store_marketing_ai_usage_rw" on public.store_marketing_ai_usage;

create policy "store_marketing_ai_usage_rw" on public.store_marketing_ai_usage
  for all using (
    exists (
      select 1 from public.stores s
      where s.id = store_marketing_ai_usage.store_id
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.stores s
      where s.id = store_marketing_ai_usage.store_id
        and s.owner_id = (select auth.uid())
    )
  );

create or replace function public.increment_store_marketing_ai_usage(
  p_store_id uuid,
  p_ym text,
  p_kind text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.stores where id = p_store_id and owner_id = uid
  ) then
    raise exception 'forbidden';
  end if;
  if p_kind not in ('description', 'image') then
    raise exception 'invalid kind';
  end if;

  insert into public.store_marketing_ai_usage (
    store_id, year_month, description_count, image_count
  )
  values (
    p_store_id,
    p_ym,
    case when p_kind = 'description' then 1 else 0 end,
    case when p_kind = 'image' then 1 else 0 end
  )
  on conflict (store_id, year_month) do update set
    description_count = public.store_marketing_ai_usage.description_count
      + case when p_kind = 'description' then 1 else 0 end,
    image_count = public.store_marketing_ai_usage.image_count
      + case when p_kind = 'image' then 1 else 0 end;
end;
$$;

grant execute on function public.increment_store_marketing_ai_usage(uuid, text, text) to authenticated;
