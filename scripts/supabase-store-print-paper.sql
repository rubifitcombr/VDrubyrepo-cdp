-- Largura do papel térmico (58 ou 80 mm) para layout ESC/POS.
-- Executar no SQL Editor do Supabase.

alter table public.stores
  add column if not exists print_paper_mm integer not null default 80;

comment on column public.stores.print_paper_mm is
  'Largura do papel: 58 (32 colunas) ou 80 (48 colunas) para cupons ESC/POS.';

update public.stores
set print_paper_mm = 80
where print_paper_mm not in (58, 80);
