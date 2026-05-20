/** Linhas fixas no início de `orders.notes` para pedidos do Garçom / QR mesa. */

/** Origens que alimentam o mapa de mesas e a lista de comandas abertas no módulo Garçom. */
export const SALON_MAP_ORDER_SOURCES = ['waiter', 'autoatendimento'] as const

export function isSalonMapOrderSource(source: string | null | undefined): boolean {
  const s = String(source ?? '').trim().toLowerCase()
  return (SALON_MAP_ORDER_SOURCES as readonly string[]).includes(s)
}

/** Quando presente em `orders.notes`, o pedido deixa de aparecer no mapa do Garçom mas continua aberto no Caixa. */
export const WAITER_PENDING_CAIXA_MARKER =
  '[Caixa pendente] Aguarda fecho pelo caixa.'

export function notesIndicateWaiterReleasedToCaixa(
  notes: string | null | undefined
): boolean {
  return String(notes ?? '').includes(WAITER_PENDING_CAIXA_MARKER)
}

export function parseTableFromNotes(notes: string | null | undefined): string | null {
  const t = notes?.trim()
  if (!t) return null
  const m = t.match(/^\[Mesa\s+([^\]]+)\]/im) || t.match(/\n\[Mesa\s+([^\]]+)\]/im)
  return m?.[1]?.trim() || null
}

/** Normaliza rótulo de mesa para comparar "12", "Mesa 12", "mesa 12". */
export function normalizeTableLabel(value: string): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^mesa\s+/, '')
}

export function tableNamesMatch(orderTable: string, configuredName: string): boolean {
  const a = normalizeTableLabel(orderTable)
  const b = normalizeTableLabel(configuredName)
  if (!a || !b) return false
  if (a === b) return true
  const digitsA = a.replace(/\D/g, '')
  const digitsB = b.replace(/\D/g, '')
  if (digitsA && digitsB && digitsA === digitsB && /^\d+$/.test(digitsA)) return true
  return false
}

function isDefaultSalonSector(sector: string): boolean {
  const s = sector.trim().toLowerCase()
  return s === 'salão' || s === 'salao'
}

/** Associa comanda aberta à célula do mapa (nome + ambiente). */
export function orderMatchesSalonTable(
  o: { notes?: string | null; source?: string | null },
  tableName: string,
  ambiente: string,
  configuredTables: { name: string; ambiente: string }[] = []
): boolean {
  const tn = parseTableFromNotes(o.notes) || ''
  if (!tableNamesMatch(tn, tableName)) return false

  const orderSector = parseSectorFromNotes(o.notes)
  if (orderSector.trim().toLowerCase() === ambiente.trim().toLowerCase()) return true

  const source = String(o.source ?? '').trim().toLowerCase()
  if (source !== 'autoatendimento' || !isDefaultSalonSector(orderSector)) return false

  const candidates = configuredTables.filter((t) => tableNamesMatch(tn, t.name))
  if (candidates.length <= 1) {
    return (
      candidates.length === 1 &&
      candidates[0]!.ambiente.trim().toLowerCase() === ambiente.trim().toLowerCase()
    )
  }
  return isDefaultSalonSector(ambiente)
}

export function parseSectorFromNotes(notes: string | null | undefined): string {
  const t = notes?.trim()
  if (!t) return 'Salão'
  const m = t.match(/^\[Setor\s+([^\]]+)\]/im) || t.match(/\n\[Setor\s+([^\]]+)\]/im)
  return m?.[1]?.trim() || 'Salão'
}

export function extractUserNotes(notes: string | null | undefined): string {
  if (!notes?.trim()) return ''
  return notes
    .split('\n')
    .filter((line) => {
      const l = line.trim()
      if (/^\[Mesa\s+/i.test(l)) return false
      if (/^\[Setor\s+/i.test(l)) return false
      if (/^Desconto( manual)?:/i.test(l)) return false
      if (l.startsWith(WAITER_PENDING_CAIXA_MARKER)) return false
      if (/^\[Garçom\] Recebido em /i.test(l)) return false
      if (/^\[Caixa pendente\]/i.test(l)) return false
      return true
    })
    .join('\n')
    .trim()
}

export function parseDiscountFromNotes(notes: string | null | undefined): number {
  if (!notes) return 0
  const m = notes.match(/Desconto( manual)?:\s*R\$\s*([\d.,]+)/i)
  if (!m?.[2]) return 0
  const raw = m[2].replace(/\./g, '').replace(',', '.')
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
}

export function buildWaiterNotes(
  table: string,
  sector: string,
  userNotes: string,
  discountBrl: number
): string {
  const lines: string[] = [`[Mesa ${table.trim()}]`, `[Setor ${sector.trim() || 'Salão'}]`]
  const disc = Math.round(Math.max(0, discountBrl) * 100) / 100
  if (disc > 0) {
    lines.push(`Desconto: R$ ${disc.toFixed(2).replace('.', ',')}`)
  }
  const extra = userNotes.trim()
  if (extra) lines.push(extra)
  return lines.join('\n')
}
