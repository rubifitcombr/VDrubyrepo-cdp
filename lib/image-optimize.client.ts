/**
 * Redimensiona e comprime imagens no browser antes do upload ao Supabase Storage.
 * SVG e GIF animado passam sem alteração.
 */

const MAX_EDGE = 1600
const WEBP_QUALITY = 0.82
const JPEG_QUALITY = 0.85
/** Abaixo disto não vale a pena processar (poupança de CPU). */
const MIN_BYTES_TO_PROCESS = 50 * 1024

export async function optimizeImageFileForUpload(file: File): Promise<File> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return file
  }
  if (!file.type.startsWith('image/')) return file
  if (file.type === 'image/svg+xml') return file
  if (file.type === 'image/gif') return file
  if (file.size < MIN_BYTES_TO_PROCESS) return file

  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file)
  } catch {
    return file
  }

  try {
    const maxDim = Math.max(bmp.width, bmp.height)
    const scale = maxDim > MAX_EDGE ? MAX_EDGE / maxDim : 1
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bmp, 0, 0, w, h)

    let blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/webp', WEBP_QUALITY)
    })
    let mime = 'image/webp'
    let ext = 'webp'

    if (!blob) {
      blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY)
      })
      mime = 'image/jpeg'
      ext = 'jpg'
    }

    if (!blob || blob.size === 0) return file

    const baseName =
      file.name.replace(/\.[^/.]+$/, '').replace(/[^\w\-]+/g, '_') || 'imagem'
    return new File([blob], `${baseName}.${ext}`, {
      type: mime,
      lastModified: Date.now(),
    })
  } finally {
    bmp.close()
  }
}
