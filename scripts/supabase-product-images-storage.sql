-- Imagens do cardápio: bucket público + colunas em products/stores
-- Executar no SQL Editor do Supabase (uma vez por projecto).

-- Colunas (se ainda não existirem)
alter table public.products
  add column if not exists image_url text;

alter table public.stores
  add column if not exists logo_url text;

alter table public.stores
  add column if not exists storefront_banner_url text;

-- Bucket público para fotos de produtos, logo e banner
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Leitura pública (cardápio online)
drop policy if exists "Public read product images" on storage.objects;
create policy "Public read product images"
on storage.objects
for select
to public
using (bucket_id = 'product-images');

-- Upload por utilizadores autenticados (painel da loja)
drop policy if exists "Authenticated upload product images" on storage.objects;
create policy "Authenticated upload product images"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'product-images');

-- Actualizar/remover ficheiros próprios (opcional — facilita trocar logo/banner)
drop policy if exists "Authenticated update product images" on storage.objects;
create policy "Authenticated update product images"
on storage.objects
for update
to authenticated
using (bucket_id = 'product-images')
with check (bucket_id = 'product-images');

drop policy if exists "Authenticated delete product images" on storage.objects;
create policy "Authenticated delete product images"
on storage.objects
for delete
to authenticated
using (bucket_id = 'product-images');
