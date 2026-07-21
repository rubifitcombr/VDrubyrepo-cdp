-- Storage: isolamento por loja (product-images) e bloqueio de acesso directo (fiscal-invoices, contratos).

-- ─── product-images: prefixo {store_id}/ ─────────────────────────────────────
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
CREATE POLICY "Public read product images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Authenticated upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete product images" ON storage.objects;
DROP POLICY IF EXISTS "Owner upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Owner update product images" ON storage.objects;
DROP POLICY IF EXISTS "Owner delete product images" ON storage.objects;

CREATE POLICY "Owner upload product images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner update product images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Owner delete product images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.stores WHERE owner_id = auth.uid()
    )
  );

-- fiscal-invoices e contratos: sem policies = só service role acede (bucket private).

SELECT pg_notify('pgrst', 'reload schema');
