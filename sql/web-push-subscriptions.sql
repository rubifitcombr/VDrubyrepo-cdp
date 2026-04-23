create table if not exists public.store_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_store_push_subscriptions_store_id
  on public.store_push_subscriptions(store_id);

create index if not exists idx_store_push_subscriptions_user_id
  on public.store_push_subscriptions(user_id);

