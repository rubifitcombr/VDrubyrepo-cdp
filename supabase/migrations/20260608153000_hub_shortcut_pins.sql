alter table public.stores
  add column if not exists hub_pin_balcao_enabled boolean not null default false,
  add column if not exists hub_pin_balcao text,
  add column if not exists hub_pin_salao_enabled boolean not null default false,
  add column if not exists hub_pin_salao text,
  add column if not exists hub_pin_cozinha_enabled boolean not null default false,
  add column if not exists hub_pin_cozinha text,
  add column if not exists hub_pin_admin_enabled boolean not null default false,
  add column if not exists hub_pin_admin text;

alter table public.stores
  add constraint stores_hub_pin_balcao_format
    check (hub_pin_balcao is null or hub_pin_balcao ~ '^[0-9]{4}$'),
  add constraint stores_hub_pin_salao_format
    check (hub_pin_salao is null or hub_pin_salao ~ '^[0-9]{4}$'),
  add constraint stores_hub_pin_cozinha_format
    check (hub_pin_cozinha is null or hub_pin_cozinha ~ '^[0-9]{4}$'),
  add constraint stores_hub_pin_admin_format
    check (hub_pin_admin is null or hub_pin_admin ~ '^[0-9]{4}$');

alter table public.stores
  drop column if exists waiter_exit_pin;
