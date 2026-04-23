import { optimizeImageFileForUpload } from '@/lib/image-optimize.client'
import { createClient } from '@/lib/supabase/client'

const BUCKET = 'product-images'

async function prepareImageFile(file: File): Promise<File> {
  try {
    return await optimizeImageFileForUpload(file)
  } catch {
    return file
  }
}

function contentTypeForUpload(file: File, ext: string) {
  const t = file.type?.trim()
  if (t && t !== 'application/octet-stream') return t
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'application/octet-stream'
}

export async function uploadProductImage(
  storeId: string,
  file: File
): Promise<{ publicUrl: string | null; error: Error | null }> {
  const supabase = createClient()
  const toUpload = await prepareImageFile(file)
  const ext =
    toUpload.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ||
    'jpg'
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)
    ? ext
    : 'jpg'
  const path = `${storeId}/${crypto.randomUUID()}.${safeExt}`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, toUpload, {
      contentType: contentTypeForUpload(toUpload, safeExt),
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
  const toUpload = await prepareImageFile(file)
  const ext =
    toUpload.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ||
    'jpg'
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)
    ? ext
    : 'jpg'
  const path = `${storeId}/banner-${crypto.randomUUID()}.${safeExt}`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, toUpload, {
      contentType: contentTypeForUpload(toUpload, safeExt),
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
  const toUpload = await prepareImageFile(file)
  const ext =
    toUpload.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ||
    'jpg'
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)
    ? ext
    : 'jpg'
  const path = `${storeId}/logo-${crypto.randomUUID()}.${safeExt}`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, toUpload, {
      contentType: contentTypeForUpload(toUpload, safeExt),
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
