import 'server-only'

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12

function encryptionKey(): Buffer {
  const raw = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY?.trim()
  if (!raw || raw.length < 16) {
    throw new Error(
      'WHATSAPP_TOKEN_ENCRYPTION_KEY não configurada (mín. 16 caracteres).'
    )
  }
  return createHash('sha256').update(raw).digest()
}

/** Encripta token WABA para guardar em `store_whatsapp_config.access_token_enc`. */
export function encryptWhatsAppToken(plain: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, encryptionKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`
}

export function decryptWhatsAppToken(payload: string): string {
  const parts = payload.split(':')
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Formato de token encriptado inválido.')
  }
  const iv = Buffer.from(parts[1]!, 'base64url')
  const tag = Buffer.from(parts[2]!, 'base64url')
  const data = Buffer.from(parts[3]!, 'base64url')
  const decipher = createDecipheriv(ALGO, encryptionKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export function tryDecryptWhatsAppToken(payload: string | null | undefined): string | null {
  if (!payload?.trim()) return null
  try {
    return decryptWhatsAppToken(payload.trim())
  } catch {
    return null
  }
}
