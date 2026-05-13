-- Agente local de impressão térmica ESC/POS (Wi-Fi) e toggles por origem

alter table public.stores
  add column if not exists print_agent_url text,
  add column if not exists print_agent_token text default 'vyria-agent-2026',
  add column if not exists print_printer_ip text,
  add column if not exists print_printer_port int default 9100,
  add column if not exists print_auto_delivery boolean not null default false,
  add column if not exists print_auto_autoatendimento boolean not null default false,
  add column if not exists print_auto_pdv boolean not null default false,
  add column if not exists print_auto_garcom boolean not null default false;

comment on column public.stores.print_agent_url is
  'URL base do agente Node na rede local (ex.: http://192.168.1.10:3001).';
comment on column public.stores.print_agent_token is
  'Token partilhado com o header x-agent-token do agente.';
comment on column public.stores.print_printer_ip is
  'IP da impressora térmica na LAN (porta ESC/POS raw, normalmente 9100).';
