import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/service-role.server'

export const FISCAL_INVOICES_BUCKET = 'fiscal-invoices'

export type FiscalArtifactKind = 'xml' | 'danfe'

/** Path estável por loja + chave + tipo. */
export function fiscalArtifactStoragePath(
  storeId: string,
  chaveAcesso: string,
  kind: FiscalArtifactKind
): string {
  const chave = chaveAcesso.replace(/\D/g, '')
  const ext = kind === 'xml' ? 'xml' : 'pdf'
  return `${storeId}/${chave}.${ext}`
}

/** Rota autenticada para o lojista abrir/baixar o artefato. */
export function fiscalArquivoApiPath(
  invoiceId: string,
  tipo: FiscalArtifactKind
): string {
  return `/api/store/fiscal/arquivo?invoiceId=${encodeURIComponent(invoiceId)}&tipo=${tipo}`
}

function decodeBase64ToBuffer(raw: string): Buffer | null {
  const cleaned = raw.replace(/\s/g, '')
  if (!cleaned) return null
  try {
    const buf = Buffer.from(cleaned, 'base64')
    return buf.length ? buf : null
  } catch {
    return null
  }
}

/**
 * Extrai a URL do QR Code NFC-e do XML autorizado (`infNFeSupl` / `qrCode`).
 */
export function extractNfceQrCodeUrl(xml: string): string | null {
  if (!xml?.trim()) return null
  const patterns = [
    /<qrCode[^>]*>([\s\S]*?)<\/qrCode>/i,
    /<qrcode[^>]*>([\s\S]*?)<\/qrcode>/i,
  ]
  for (const re of patterns) {
    const m = xml.match(re)
    if (!m?.[1]) continue
    const url = m[1]
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/&amp;/g, '&')
      .trim()
    if (/^https?:\/\//i.test(url)) return url
  }
  return null
}

export async function uploadFiscalArtifact(params: {
  storeId: string
  chaveAcesso: string
  kind: FiscalArtifactKind
  /** Conteúdo já em Buffer, ou base64. */
  data: Buffer | string
}): Promise<{ path: string | null; error?: string }> {
  const { storeId, chaveAcesso, kind } = params
  const buf =
    typeof params.data === 'string'
      ? decodeBase64ToBuffer(params.data)
      : params.data
  if (!buf?.length) {
    return { path: null, error: 'Conteúdo do artefato vazio.' }
  }

  const path = fiscalArtifactStoragePath(storeId, chaveAcesso, kind)
  const contentType =
    kind === 'xml' ? 'application/xml' : 'application/pdf'

  try {
    const svc = createServiceRoleClient()
    const { error } = await svc.storage.from(FISCAL_INVOICES_BUCKET).upload(path, buf, {
      contentType,
      upsert: true,
      cacheControl: 'private, max-age=31536000',
    })
    if (error) {
      console.warn('[fiscal-artifacts] upload', kind, error.message)
      return { path: null, error: error.message }
    }
    return { path }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha no upload.'
    console.warn('[fiscal-artifacts] upload', kind, msg)
    return { path: null, error: msg }
  }
}

export async function downloadFiscalArtifact(
  storagePath: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!storagePath?.trim()) return null
  try {
    const svc = createServiceRoleClient()
    const { data, error } = await svc.storage
      .from(FISCAL_INVOICES_BUCKET)
      .download(storagePath)
    if (error || !data) return null
    const buffer = Buffer.from(await data.arrayBuffer())
    const isXml = storagePath.toLowerCase().endsWith('.xml')
    return {
      buffer,
      contentType: isXml ? 'application/xml' : 'application/pdf',
    }
  } catch (e) {
    console.warn('[fiscal-artifacts] download', e)
    return null
  }
}

/**
 * Persiste XML + DANFE a partir do retorno da emissão (ou buffers de fallback)
 * e extrai o QR Code do XML.
 */
export async function persistNfceArtifacts(params: {
  storeId: string
  invoiceId: string
  chaveAcesso: string
  xmlBase64?: string | null
  danfeBase64?: string | null
  xmlBuffer?: Buffer | null
  danfeBuffer?: Buffer | null
}): Promise<{
  xmlPath: string | null
  danfePath: string | null
  xmlUrl: string | null
  nfeUrl: string | null
  qrCodeUrl: string | null
}> {
  const { storeId, invoiceId, chaveAcesso } = params
  let xmlPath: string | null = null
  let danfePath: string | null = null
  let qrCodeUrl: string | null = null

  const xmlData = params.xmlBuffer ?? params.xmlBase64 ?? null
  if (xmlData) {
    const up = await uploadFiscalArtifact({
      storeId,
      chaveAcesso,
      kind: 'xml',
      data: xmlData,
    })
    xmlPath = up.path
    if (xmlPath) {
      const xmlText =
        typeof xmlData === 'string'
          ? Buffer.from(xmlData.replace(/\s/g, ''), 'base64').toString('utf8')
          : xmlData.toString('utf8')
      qrCodeUrl = extractNfceQrCodeUrl(xmlText)
    }
  }

  const danfeData = params.danfeBuffer ?? params.danfeBase64 ?? null
  if (danfeData) {
    const up = await uploadFiscalArtifact({
      storeId,
      chaveAcesso,
      kind: 'danfe',
      data: danfeData,
    })
    danfePath = up.path
  }

  const xmlUrl = xmlPath ? fiscalArquivoApiPath(invoiceId, 'xml') : null
  const nfeUrl = danfePath ? fiscalArquivoApiPath(invoiceId, 'danfe') : null

  return { xmlPath, danfePath, xmlUrl, nfeUrl, qrCodeUrl }
}
