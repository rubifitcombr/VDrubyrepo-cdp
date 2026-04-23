import 'server-only'

import sharp from 'sharp'

/** Lado maior em px; cardápio e miniaturas não precisam de ficheiros gigantes. */
const MAX_EDGE = 1600
const WEBP_QUALITY = 82

/**
 * Redimensiona (se necessário) e converte para WebP para ocupar menos espaço no Storage.
 */
export async function optimizeImageBufferForStorage(
  input: Buffer
): Promise<{ buffer: Buffer; contentType: 'image/webp' }> {
  const buffer = await sharp(input)
    .rotate()
    .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer()

  return { buffer, contentType: 'image/webp' }
}
