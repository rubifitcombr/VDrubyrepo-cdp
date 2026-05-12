import iconv from 'iconv-lite'
import { sanitizePrintText } from '@/lib/print/sanitize'
import { logPrintJob } from '@/lib/print/logger'

/** Inicializa impressora. */
export const ESC_INIT = Uint8Array.of(0x1b, 0x40)

/** Selecciona tabela de caracteres PC850 (multilingue Latin-1) — comum em Epson. */
export const ESC_CODEPAGE_PC850 = Uint8Array.of(0x1b, 0x74, 0x02)

/** Avanço de linha e corte parcial (GS V). */
export const ESC_FEED_CUT = Uint8Array.of(0x1b, 0x64, 0x05, 0x1d, 0x56, 0x42, 0x00)

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0)
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

export function encodeCp850(text: string): Uint8Array {
  const safe = sanitizePrintText(text)
  try {
    const buf = iconv.encode(safe, 'cp850')
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  } catch (e) {
    logPrintJob({
      phase: 'error',
      detail: e instanceof Error ? e.message : 'iconv encode',
    })
    const fallback = iconv.encode(
      safe.replace(/[^\x00-\x7F\n]/g, '?'),
      'latin1'
    )
    return new Uint8Array(fallback.buffer, fallback.byteOffset, fallback.byteLength)
  }
}

export function buildEscPosTicket(bodyTextUtf8: string): Uint8Array {
  logPrintJob({ phase: 'encode_cp850', bytesLength: bodyTextUtf8.length })
  const body = encodeCp850(
    bodyTextUtf8.endsWith('\n') ? bodyTextUtf8 : `${bodyTextUtf8}\n`
  )
  return concatBytes(ESC_INIT, ESC_CODEPAGE_PC850, body, ESC_FEED_CUT)
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk)
    binary += String.fromCharCode(...sub)
  }
  return btoa(binary)
}
