import 'server-only'

import { valorMensalPlanoFromStore } from '@/lib/admin-mrr'
import type { MerchantStatus } from '@/lib/merchant-status'
import { parseMerchantStatus } from '@/lib/merchant-status'
import type { Plan } from '@/lib/plan'
import { parsePlan } from '@/lib/plan'
import { readContractAcceptance } from '@/lib/annual-contract-acceptance'
import {
  parseBillingCycle,
  type BillingCycle,
} from '@/lib/contract-pricing'
import {
  parseOperationModeFromStore,
  type MerchantOperationMode,
} from '@/lib/merchant-operation-mode'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readStorePlano, readStoreStatus } from '@/lib/store-columns'

export type FaturaAdminRow = {
  id: string
  criado_em: string
  descricao: string
  valor: number
  status: 'pago' | 'pendente' | 'falhou'
}

export type LojistaListRow = {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  plano: Plan
  /** `null` = legado (regras só por plano no painel). */
  operation_mode: MerchantOperationMode | null
  status: MerchantStatus
  plano_vence_em: string | null
  billing_cycle: BillingCycle
  contrato_inicio_em: string | null
  contrato_fim_em: string | null
  contrato_mensal_brl: number | null
  contrato_assinado_em: string | null
  contrato_documento_hash: string | null
  contrato_pode_baixar_pdf: boolean
  cadastrado_em: string | null
  cancelamento_solicitado: boolean
  /** Linhas na tabela `products` desta loja. */
  produtos_count: number
  /** Soma do campo `total` dos pedidos não cancelados (`orders`). */
  faturamento_pedidos: number
}

export type AdminLogRow = {
  id: number
  criado_em: string
  acao: string
  detalhes: string | null
  admin_email: string | null
}

/** PostgREST devolve no máx. ~1000 linhas por pedido sem range; agregações admin precisam de todas. */
const ADMIN_AGG_PAGE_SIZE = 1000

function orderCountsTowardFaturamento(status: unknown): boolean {
  const s = String(status ?? '').trim().toLowerCase()
  if (s === 'cancelled' || s === 'cancelado' || s === 'canceled') return false
  return true
}

function rowToLojista(
  store: Record<string, unknown>,
  emailMap: Record<string, string | null>
): Omit<LojistaListRow, 'produtos_count' | 'faturamento_pedidos'> {
  const ownerId = String(store.owner_id ?? '')
  const cancelRaw = store.cancelamento_solicitado
  const acceptance = readContractAcceptance(store)
  return {
    id: String(store.id),
    nome: String(store.name ?? ''),
    email: emailMap[ownerId] ?? null,
    telefone:
      typeof store.phone === 'string' && store.phone.trim()
        ? store.phone.trim()
        : null,
    plano: parsePlan(readStorePlano(store)),
    operation_mode: parseOperationModeFromStore(store),
    status: parseMerchantStatus(readStoreStatus(store)),
    plano_vence_em:
      typeof store.plano_vence_em === 'string'
        ? store.plano_vence_em
        : null,
    billing_cycle: parseBillingCycle(store.billing_cycle),
    contrato_inicio_em:
      typeof store.contrato_inicio_em === 'string' ? store.contrato_inicio_em : null,
    contrato_fim_em:
      typeof store.contrato_fim_em === 'string' ? store.contrato_fim_em : null,
    contrato_mensal_brl:
      typeof store.contrato_mensal_brl === 'number' && Number.isFinite(store.contrato_mensal_brl)
        ? store.contrato_mensal_brl
        : typeof store.contrato_mensal_brl === 'string' && store.contrato_mensal_brl.trim() !== ''
          ? Number(store.contrato_mensal_brl.replace(',', '.'))
          : null,
    contrato_assinado_em: acceptance.aceiteEm,
    contrato_documento_hash: acceptance.documentoHash,
    contrato_pode_baixar_pdf: Boolean(acceptance.pdfPath && acceptance.documentoHash),
    cadastrado_em:
      typeof store.created_at === 'string' ? store.created_at : null,
    cancelamento_solicitado:
      cancelRaw === true || cancelRaw === 'true' || cancelRaw === 1,
  }
}

async function aggregateProductsByStore(
  svc: SupabaseClient
): Promise<Record<string, number>> {
  const rows: { store_id?: string }[] = []
  for (let from = 0; ; from += ADMIN_AGG_PAGE_SIZE) {
    const to = from + ADMIN_AGG_PAGE_SIZE - 1
    const { data, error } = await svc
      .from('products')
      .select('store_id')
      .order('id', { ascending: true })
      .range(from, to)
    if (error) {
      if (/relation|does not exist|42P01/i.test(error.message)) return {}
      console.warn('[admin-lojistas] products:', error.message)
      return {}
    }
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < ADMIN_AGG_PAGE_SIZE) break
  }
  const m: Record<string, number> = {}
  for (const r of rows) {
    const sid = String(r.store_id ?? '')
    if (!sid) continue
    m[sid] = (m[sid] ?? 0) + 1
  }
  return m
}

async function aggregateOrderRevenueByStore(
  svc: SupabaseClient
): Promise<Record<string, number>> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += ADMIN_AGG_PAGE_SIZE) {
    const to = from + ADMIN_AGG_PAGE_SIZE - 1
    const { data, error } = await svc
      .from('orders')
      .select('store_id, total, status')
      .order('id', { ascending: true })
      .range(from, to)
    if (error) {
      if (/relation|does not exist|42P01/i.test(error.message)) return {}
      console.warn('[admin-lojistas] orders:', error.message)
      return {}
    }
    const chunk = data ?? []
    rows.push(...(chunk as Record<string, unknown>[]))
    if (chunk.length < ADMIN_AGG_PAGE_SIZE) break
  }
  const m: Record<string, number> = {}
  for (const row of rows) {
    if (!orderCountsTowardFaturamento(row.status)) continue
    const sid = String(row.store_id ?? '')
    if (!sid) continue
    const total =
      typeof row.total === 'number'
        ? row.total
        : Number(String(row.total ?? '').replace(',', '.'))
    if (!Number.isFinite(total)) continue
    m[sid] = Math.round(((m[sid] ?? 0) + total) * 100) / 100
  }
  return m
}

export async function fetchStoreUsageStats(
  svc: SupabaseClient,
  storeId: string
): Promise<{ produtos_count: number; faturamento_pedidos: number }> {
  const { count, error: eProd } = await svc
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)

  let produtos_count = 0
  if (!eProd && typeof count === 'number') produtos_count = count

  let faturamento_pedidos = 0
  for (let from = 0; ; from += ADMIN_AGG_PAGE_SIZE) {
    const to = from + ADMIN_AGG_PAGE_SIZE - 1
    const { data: orders, error: eOrd } = await svc
      .from('orders')
      .select('total, status')
      .eq('store_id', storeId)
      .order('id', { ascending: true })
      .range(from, to)
    if (eOrd) {
      if (!/relation|does not exist|42P01/i.test(eOrd.message)) {
        console.warn('[admin-lojistas] orders(store):', eOrd.message)
      }
      break
    }
    const chunk = orders ?? []
    for (const r of chunk) {
      const row = r as Record<string, unknown>
      if (!orderCountsTowardFaturamento(row.status)) continue
      const total =
        typeof row.total === 'number'
          ? row.total
          : Number(String(row.total ?? '').replace(',', '.'))
      if (!Number.isFinite(total)) continue
      faturamento_pedidos = Math.round((faturamento_pedidos + total) * 100) / 100
    }
    if (chunk.length < ADMIN_AGG_PAGE_SIZE) break
  }

  return { produtos_count, faturamento_pedidos }
}

function sortLojistas(rows: LojistaListRow[]): LojistaListRow[] {
  const rank: Record<MerchantStatus, number> = {
    pendente: 0,
    ativo: 1,
    bloqueado: 2,
    cancelado: 3,
  }
  return [...rows].sort((a, b) => {
    const ra = rank[a.status] ?? 9
    const rb = rank[b.status] ?? 9
    if (ra !== rb) return ra - rb
    const ta = a.plano_vence_em
      ? new Date(a.plano_vence_em).getTime()
      : Number.POSITIVE_INFINITY
    const tb = b.plano_vence_em
      ? new Date(b.plano_vence_em).getTime()
      : Number.POSITIVE_INFINITY
    if (ta !== tb) return ta - tb
    const ca = a.cadastrado_em
      ? new Date(a.cadastrado_em).getTime()
      : 0
    const cb = b.cadastrado_em
      ? new Date(b.cadastrado_em).getTime()
      : 0
    return cb - ca
  })
}

function matchesSearch(row: LojistaListRow, q: string): boolean {
  if (!q) return true
  const n = q.toLowerCase()
  const tel = (row.telefone ?? '').toLowerCase().replace(/\s/g, '')
  const nTel = n.replace(/\D/g, '')
  const rTel = tel.replace(/\D/g, '')
  return (
    row.nome.toLowerCase().includes(n) ||
    (row.email?.toLowerCase().includes(n) ?? false) ||
    tel.includes(n) ||
    (nTel.length > 0 && rTel.includes(nTel))
  )
}

/** Dias até plano_vence_em (YYYY-MM-DD); negativo = vencido. */
function daysUntilVencimento(planoVenceEm: string | null): number | null {
  if (!planoVenceEm || !/^\d{4}-\d{2}-\d{2}$/.test(planoVenceEm.trim())) {
    return null
  }
  const iso = planoVenceEm.trim()
  const [y, m, d] = iso.split('-').map(Number)
  const target = new Date(y!, m! - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

/** Urgentes: cancelamento solicitado, vencido, ou vence em até 3 dias (ativos com data). */
export function isUrgente(row: LojistaListRow): boolean {
  if (row.cancelamento_solicitado) return true
  if (row.status !== 'ativo') return false
  const days = daysUntilVencimento(row.plano_vence_em)
  if (days === null) return false
  return days <= 3
}

export type CadastroPorDia = { data: string; count: number }
export type StatusSlice = { name: string; value: number }

function isoDateLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Contagem de novos cadastros por dia (últimos 14 dias, timezone local do servidor). */
export function buildCadastros14dSeries(
  stores: Record<string, unknown>[]
): CadastroPorDia[] {
  const end = new Date()
  end.setHours(0, 0, 0, 0)
  const series: CadastroPorDia[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(end)
    d.setDate(d.getDate() - i)
    series.push({ data: isoDateLocal(d), count: 0 })
  }
  const idx = new Map(series.map((x) => [x.data, x]))
  for (const s of stores) {
    const ca = s.created_at
    if (typeof ca !== 'string') continue
    const day = ca.slice(0, 10)
    const slot = idx.get(day)
    if (slot) slot.count++
  }
  return series
}

export function buildStatusDistribution(rows: LojistaListRow[]): StatusSlice[] {
  const counts: Record<string, number> = {}
  for (const r of rows) {
    counts[r.status] = (counts[r.status] ?? 0) + 1
  }
  const labels: Record<string, string> = {
    pendente: 'Pendente',
    ativo: 'Ativo',
    bloqueado: 'Bloqueado',
    cancelado: 'Cancelado',
  }
  return Object.entries(counts).map(([k, value]) => ({
    name: labels[k] ?? k,
    value,
  }))
}

/**
 * Utilizadores Auth (id → email). `null` se listUsers falhar (não filtrar lojas).
 * Usa páginas de 200 (limite seguro do GoTrue) para não truncar a lista.
 */
async function fetchAuthUsersIndex(
  svc: SupabaseClient
): Promise<Map<string, string | null> | null> {
  const map = new Map<string, string | null>()
  const perPage = 200
  for (let page = 1; page <= 200; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage })
    if (error) {
      console.error('[admin-lojistas] listUsers falhou:', error.message)
      return null
    }
    const users = data?.users ?? []
    for (const u of users) {
      if (u?.id) map.set(u.id, u.email ?? null)
    }
    if (users.length < perPage) break
  }
  return map
}

async function fetchAllStores(svc: SupabaseClient): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += ADMIN_AGG_PAGE_SIZE) {
    const to = from + ADMIN_AGG_PAGE_SIZE - 1
    const { data, error } = await svc
      .from('stores')
      .select('*')
      .order('created_at', { ascending: false, nullsFirst: false })
      .range(from, to)
    if (error) throw new Error(error.message)
    const batch = (data ?? []) as Record<string, unknown>[]
    rows.push(...batch)
    if (batch.length < ADMIN_AGG_PAGE_SIZE) break
  }
  return rows
}

export async function fetchLojistasForAdmin(
  svc: SupabaseClient,
  params: { filtro: string; q: string }
): Promise<{
  metrics: {
    total: number
    ativos: number
    pendentes: number
    bloqueadosCancelados: number
    mrr: number
    urgentesCount: number
  }
  charts: {
    cadastros14d: CadastroPorDia[]
    statusDistrib: StatusSlice[]
  }
  lojistas: LojistaListRow[]
}> {
  const rawList = await fetchAllStores(svc)

  // Alinha o painel com o banco: oculta lojas cujo dono já não existe em
  // auth.users (ex.: usuário apagado direto no Supabase Authentication).
  const authIndex = await fetchAuthUsersIndex(svc)
  const list =
    authIndex === null
      ? rawList
      : rawList.filter((s) => {
          const ownerId = String(s.owner_id ?? '').trim()
          // Mantém lojas sem dono (caso legado); oculta apenas quando o dono
          // foi apagado de auth.users.
          if (ownerId === '') return true
          return authIndex.has(ownerId)
        })

  const ownerIds = [
    ...new Set(
      list.map((s) => String(s.owner_id ?? '')).filter(Boolean)
    ),
  ]

  const emailMap: Record<string, string | null> = {}
  // Preferir email do Auth; complementar com public.usuarios.
  if (authIndex) {
    for (const id of ownerIds) {
      if (authIndex.has(id)) emailMap[id] = authIndex.get(id) ?? null
    }
  }
  if (ownerIds.length > 0) {
    const chunkSize = 150
    for (let i = 0; i < ownerIds.length; i += chunkSize) {
      const chunk = ownerIds.slice(i, i + chunkSize)
      const { data: usuarios } = await svc
        .from('usuarios')
        .select('id, email')
        .in('id', chunk)
      for (const u of usuarios ?? []) {
        const r = u as { id: string; email: string | null }
        if (!emailMap[r.id] && r.email) emailMap[r.id] = r.email
      }
    }
  }

  const [productByStore, revenueByStore] = await Promise.all([
    aggregateProductsByStore(svc),
    aggregateOrderRevenueByStore(svc),
  ])

  const allRows = sortLojistas(
    list.map((s) => {
      const sid = String(s.id ?? '')
      const core = rowToLojista(s, emailMap)
      return {
        ...core,
        produtos_count: productByStore[sid] ?? 0,
        faturamento_pedidos: revenueByStore[sid] ?? 0,
      }
    })
  )

  const storeById = new Map(list.map((s) => [String(s.id ?? ''), s]))

  const charts = {
    cadastros14d: buildCadastros14dSeries(list),
    statusDistrib: buildStatusDistribution(allRows),
  }

  const metrics = {
    total: allRows.length,
    ativos: 0,
    pendentes: 0,
    bloqueadosCancelados: 0,
    mrr: 0,
    urgentesCount: 0,
  }
  for (const r of allRows) {
    if (r.status === 'ativo') {
      metrics.ativos++
      metrics.mrr += valorMensalPlanoFromStore(
        r.plano,
        r.operation_mode,
        storeById.get(r.id) ?? {}
      )
    } else if (r.status === 'pendente') metrics.pendentes++
    else if (r.status === 'bloqueado' || r.status === 'cancelado')
      metrics.bloqueadosCancelados++
    if (isUrgente(r)) metrics.urgentesCount++
  }

  const filtro = params.filtro.toLowerCase()
  const q = params.q.trim()

  let filtered = allRows.filter((r) => matchesSearch(r, q))

  switch (filtro) {
    case 'pendente':
      filtered = filtered.filter((r) => r.status === 'pendente')
      break
    case 'ativo':
      filtered = filtered.filter((r) => r.status === 'ativo')
      break
    case 'bloqueado':
      filtered = filtered.filter((r) => r.status === 'bloqueado')
      break
    case 'cancelado':
      filtered = filtered.filter((r) => r.status === 'cancelado')
      break
    case 'urgentes':
    case 'vencendo':
      filtered = filtered.filter((r) => isUrgente(r))
      break
    default:
      break
  }

  return { metrics, charts, lojistas: filtered }
}

async function fetchFaturasForStore(
  svc: SupabaseClient,
  storeId: string
): Promise<FaturaAdminRow[]> {
  const { data, error } = await svc
    .from('faturas')
    .select('id, criado_em, descricao, valor, status')
    .eq('store_id', storeId)
    .order('criado_em', { ascending: false })
    .limit(100)

  if (error) {
    if (!String(error.message || '').includes('relation')) {
      console.warn('[faturas]', error.message)
    }
    return []
  }
  if (!data?.length) return []

  const out: FaturaAdminRow[] = []
  for (const raw of data) {
    const o = raw as Record<string, unknown>
    const st = String(o.status || '').toLowerCase()
    if (st !== 'pago' && st !== 'pendente' && st !== 'falhou') continue
    const valor =
      typeof o.valor === 'number'
        ? o.valor
        : Number(String(o.valor ?? '').replace(',', '.'))
    if (!Number.isFinite(valor)) continue
    const criado =
      typeof o.criado_em === 'string' ? o.criado_em : ''
    if (!criado) continue
    out.push({
      id: String(o.id ?? ''),
      criado_em: criado,
      descricao: String(o.descricao ?? '').slice(0, 200),
      valor,
      status: st as FaturaAdminRow['status'],
    })
  }
  return out
}

export async function fetchLojistaDetail(
  svc: SupabaseClient,
  id: string
): Promise<{
  lojista: LojistaListRow & {
    plano_ativado_em: string | null
    plano_atualizado_em: string | null
  }
  logs: AdminLogRow[]
  faturas: FaturaAdminRow[]
} | null> {
  const { data: store, error } = await svc
    .from('stores')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !store) return null

  const s = store as Record<string, unknown>
  const ownerId = String(s.owner_id ?? '')
  const { data: urow } = await svc
    .from('usuarios')
    .select('email')
    .eq('id', ownerId)
    .maybeSingle()

  const emailMap: Record<string, string | null> = {
    [ownerId]: (urow as { email?: string | null } | null)?.email ?? null,
  }

  const base = rowToLojista(s, emailMap)
  const stats = await fetchStoreUsageStats(svc, id)
  const lojista = {
    ...base,
    ...stats,
    plano_ativado_em:
      typeof s.plano_ativado_em === 'string' ? s.plano_ativado_em : null,
    plano_atualizado_em:
      typeof s.plano_atualizado_em === 'string'
        ? s.plano_atualizado_em
        : null,
  }

  const { data: logsRaw } = await svc
    .from('admin_logs')
    .select('id, criado_em, acao, detalhes, admin_id')
    .eq('lojista_id', id)
    .order('criado_em', { ascending: false })

  const logRows = (logsRaw ?? []) as Array<{
    id: number
    criado_em: string
    acao: string
    detalhes: string | null
    admin_id: string | null
  }>

  const adminIds = [
    ...new Set(
      logRows.map((l) => String(l.admin_id ?? '')).filter(Boolean)
    ),
  ]
  const adminEmails: Record<string, string | null> = {}
  if (adminIds.length > 0) {
    const { data: admins } = await svc
      .from('usuarios')
      .select('id, email')
      .in('id', adminIds)
    for (const a of admins ?? []) {
      const r = a as { id: string; email: string | null }
      adminEmails[r.id] = r.email ?? null
    }
  }

  const logs: AdminLogRow[] = logRows.map((l) => ({
    id: l.id,
    criado_em: l.criado_em,
    acao: l.acao,
    detalhes: l.detalhes,
    admin_email: l.admin_id ? adminEmails[String(l.admin_id)] ?? null : null,
  }))

  const faturas = await fetchFaturasForStore(svc, id)

  return {
    lojista,
    logs,
    faturas,
  }
}
