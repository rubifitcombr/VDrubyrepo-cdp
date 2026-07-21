-- Imagens do cardápio: bucket público + colunas em products/stores
-- Executar no SQL Editor do Supabase (idempotente).
-- Políticas alinhadas com supabase/migrations/20260718130000_storage_security_policies.sql

alter table public.products
  add column if not exists image_url text;

alter table public.stores
  add column if not exists logo_url text;

alter table public.stores
  add column if not exists storefront_banner_url text;

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

drop policy if exists "Public read product images" on storage.objects;
create policy "Public read product images"
on storage.objects for select to public
using (bucket_id = 'product-images');

drop policy if exists "Authenticated upload product images" on storage.objects;
drop policy if exists "Authenticated update product images" on storage.objects;
drop policy if exists "Authenticated delete product images" on storage.objects;
drop policy if exists "Owner upload product images" on storage.objects;
drop policy if exists "Owner update product images" on storage.objects;
drop policy if exists "Owner delete product images" on storage.objects;

create policy "Owner upload product images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] in (
      select id::text from public.stores where owner_id = auth.uid()
    )
  );

create policy "Owner update product images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] in (
      select id::text from public.stores where owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] in (
      select id::text from public.stores where owner_id = auth.uid()
    )
  );

create policy "Owner delete product images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] in (
      select id::text from public.stores where owner_id = auth.uid()
    )
  );
