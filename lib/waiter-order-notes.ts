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

/** Quando presente em `orders.notes`, o pagamento foi registado no salão (Receber agora). */
export const GARCOM_PAYMENT_CLOSE_MARKER = '[Garçom] Recebido em '

export function notesIndicateGarcomPaymentReceived(
  notes: string | null | undefined
): boolean {
  return String(notes ?? '').includes(GARCOM_PAYMENT_CLOSE_MARKER)
}

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

/** Mesa identificável nas notas ou, em legado, em `delivery_address` («Mesa 12»). */
export function parseTableFromOrder(order: {
  notes?: string | null
  delivery_address?: string | null
}): string | null {
  const fromNotes = parseTableFromNotes(order.notes)
  if (fromNotes) return fromNotes
  const addr = String(order.delivery_address ?? '').trim()
  const m = addr.match(/^mesa\s+(.+)$/i)
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

export type SalonMapTableRef = { name: string; ambiente: string }

function isDefaultSalonSector(sector: string): boolean {
  const s = sector.trim().toLowerCase()
  return s === 'salão' || s === 'salao'
}

/** Mesas do layout que correspondem à comanda (mesmo critério do mapa do Garçom). */
export function resolveSalonMapTablesForOrder(
  o: { notes?: string | null; source?: string | null; delivery_address?: string | null },
  configuredTables: SalonMapTableRef[] = []
): SalonMapTableRef[] {
  const tn = parseTableFromOrder(o)
  if (!tn || configuredTables.length === 0) return []

  const orderSector = parseSectorFromNotes(o.notes).trim()
  const orderSectorLower = orderSector.toLowerCase()

  const candidates = configuredTables.filter((t) => tableNamesMatch(tn, t.name))
  if (candidates.length === 0) {
    // Mesa avulsa (não está no layout): ainda assim associável à comanda.
    return [{ name: tn, ambiente: orderSector || 'Salão' }]
  }

  const bySector = candidates.filter(
    (t) => t.ambiente.trim().toLowerCase() === orderSectorLower
  )
  if (bySector.length > 0) return bySector

  if (candidates.length === 1) {
    return candidates
  }

  if (isDefaultSalonSector(orderSector)) {
    const salonCandidates = candidates.filter((t) =>
      isDefaultSalonSector(t.ambiente)
    )
    if (salonCandidates.length === 1) return salonCandidates
    if (salonCandidates.length > 1) {
      // Evita duplicar a mesma comanda em várias células do mapa.
      return [salonCandidates[0]]
    }
  }

  // Ambíguo: alinhar ao fallback do checkout (primeiro candidato) para não
  // esconder a comanda do mapa quando o setor nas notas está desactualizado.
  return [candidates[0]]
}

/** Comanda com mesa reconhecida no layout configurado (coerente com o mapa). */
export function orderMapsToConfiguredSalonTable(
  o: { notes?: string | null; source?: string | null; delivery_address?: string | null },
  configuredTables: SalonMapTableRef[] = []
): boolean {
  if (!parseTableFromOrder(o)) return false
  if (configuredTables.length === 0) return true
  return resolveSalonMapTablesForOrder(o, configuredTables).length > 0
}

/** Associa comanda aberta à célula do mapa (nome + ambiente). */
export function orderMatchesSalonTable(
  o: { notes?: string | null; source?: string | null; delivery_address?: string | null },
  tableName: string,
  ambiente: string,
  configuredTables: SalonMapTableRef[] = []
): boolean {
  return resolveSalonMapTablesForOrder(o, configuredTables).some(
    (t) =>
      tableNamesMatch(t.name, tableName) &&
      t.ambiente.trim().toLowerCase() === ambiente.trim().toLowerCase()
  )
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

/**
 * Resolve o setor da comanda QR/checkout para bater com o mapa.
 * Preferência: setor pedido → única mesa com o nome → Salão → primeiro candidato.
 */
export function resolveDineInSectorForTable(
  tableLabel: string,
  configuredTables: SalonMapTableRef[],
  preferredSector?: string | null
): string {
  const preferred = String(preferredSector ?? '').trim()
  const candidates = configuredTables.filter((t) =>
    tableNamesMatch(tableLabel, t.name)
  )
  if (candidates.length === 0) {
    return preferred || 'Salão'
  }
  if (preferred) {
    const hit = candidates.find(
      (t) => t.ambiente.trim().toLowerCase() === preferred.toLowerCase()
    )
    if (hit) return hit.ambiente.trim() || 'Salão'
  }
  if (candidates.length === 1) {
    return candidates[0].ambiente.trim() || 'Salão'
  }
  const salon = candidates.find((t) => isDefaultSalonSector(t.ambiente))
  if (salon) return salon.ambiente.trim() || 'Salão'
  return candidates[0].ambiente.trim() || preferred || 'Salão'
}

/** URL pública de autoatendimento (QR), opcionalmente com mesa/setor pré-preenchidos. */
export function buildSalonSelfServiceUrl(
  origin: string,
  storeSlug: string,
  opts?: { mesa?: string | null; setor?: string | null }
): string {
  const base = `${origin.replace(/\/+$/, '')}/${encodeURIComponent(storeSlug)}`
  const qs = new URLSearchParams()
  qs.set('auto', '1')
  const mesa = String(opts?.mesa ?? '').trim()
  const setor = String(opts?.setor ?? '').trim()
  if (mesa) qs.set('mesa', mesa)
  if (setor) qs.set('setor', setor)
  return `${base}?${qs.toString()}`
}
