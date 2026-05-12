/**
 * Sanitização de texto para impressão térmica ESC/POS (evita injeção de comandos,
 * emojis, caracteres invisíveis e conteúdo que corrompe o spooler).
 */

const EMOJI_RE = /\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji}\uFE0F?/gu

/** Remove bytes de controlo perigosos e sequências ESC/GS vindas do utilizador. */
export function stripEscposControlFromUserText(s: string): string {
  return String(s ?? '')
    .replace(/\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\x1B/g, '')
    .replace(/\x1D/g, '')
    .replace(/\x1E/g, '')
    .replace(/\x1F/g, '')
}

export function removeEmojis(s: string): string {
  return String(s ?? '').replace(EMOJI_RE, '')
}

/**
 * Texto seguro para corpo do cupom antes de CP850.
 * Mantém letras acentuadas comuns (iconv trata); remove emoji e controlos.
 */
export function sanitizePrintText(text: string): string {
  let t = stripEscposControlFromUserText(text)
  t = removeEmojis(t)
  t = t.replace(/[ \t]+\n/g, '\n')
  t = t.replace(/\n{3,}/g, '\n\n')
  return t.trim()
}

/** Garante valor imprimível: nunca objeto/array/JSON bruto. */
export function stringifySafe(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'boolean') return v ? 'sim' : 'nao'
  if (typeof v === 'bigint') return String(v)
  return ''
}

/**
 * Pré-visualização apenas ASCII para `window.print()` em drivers de texto
 * (evita UTF-8 que muitas térmicas interpretam mal).
 */
export function toAsciiPreviewLine(line: string): string {
  const t = stripEscposControlFromUserText(line)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return t.replace(/[^\x20-\x7E]/g, '?')
}
