import { createClient } from '@/lib/supabase/client'

const BUCKET = 'product-images'

export async function uploadProductImage(
  storeId: string,
  file: File
): Promise<{ publicUrl: string | null; error: Error | null }> {
  const supabase = createClient()
  const ext =
    file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ||
    'jpg'
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)
    ? ext
    : 'jpg'
  const path = `${storeId}/${crypto.randomUUID()}.${safeExt}`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (upErr) {
    return {
      publicUrl: null,
      error: new Error(upErr.message),
    }
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { publicUrl: data.publicUrl, error: null }
}

/** Capa do cardápio público (mesmo bucket que produtos; pasta da loja). */
export async function uploadStorefrontBanner(
  storeId: string,
  file: File
): Promise<{ publicUrl: string | null; error: Error | null }> {
  const supabase = createClient()
  const ext =
    file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ||
    'jpg'
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)
    ? ext
    : 'jpg'
  const path = `${storeId}/banner-${crypto.randomUUID()}.${safeExt}`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (upErr) {
    return {
      publicUrl: null,
      error: new Error(upErr.message),
    }
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { publicUrl: data.publicUrl, error: null }
}

/** Logotipo da loja (painel + cardápio público). */
export async function uploadStoreLogo(
  storeId: string,
  file: File
): Promise<{ publicUrl: string | null; error: Error | null }> {
  const supabase = createClient()
  const ext =
    file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ||
    'jpg'
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)
    ? ext
    : 'jpg'
  const path = `${storeId}/logo-${crypto.randomUUID()}.${safeExt}`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (upErr) {
    return {
      publicUrl: null,
      error: new Error(upErr.message),
    }
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { publicUrl: data.publicUrl, error: null }
}
