import 'server-only'

import type { MerchantStatus } from '@/lib/merchant-status'
import { parseMerchantStatus } from '@/lib/merchant-status'
import type { Plan } from '@/lib/plan'
import { parsePlan } from '@/lib/plan'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readStorePlano, readStoreStatus } from '@/lib/store-columns'

export type LojistaListRow = {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  plano: Plan
  status: MerchantStatus
  plano_vence_em: string | null
  cadastrado_em: string | null
}

function rowToLojista(
  store: Record<string, unknown>,
  emailMap: Record<string, string | null>
): LojistaListRow {
  const ownerId = String(store.owner_id ?? '')
  return {
    id: String(store.id),
    nome: String(store.name ?? ''),
    email: emailMap[ownerId] ?? null,
    telefone:
      typeof store.phone === 'string' && store.phone.trim()
        ? store.phone.trim()
        : null,
    plano: parsePlan(readStorePlano(store)),
    status: parseMerchantStatus(readStoreStatus(store)),
    plano_vence_em:
      typeof store.plano_vence_em === 'string'
        ? store.plano_vence_em
        : null,
    cadastrado_em:
      typeof store.created_at === 'string' ? store.created_at : null,
  }
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

function inExpiringWindow(row: LojistaListRow): boolean {
  if (row.status !== 'ativo' || !row.plano_vence_em) return false
  const d = new Date(row.plano_vence_em)
  const t0 = new Date()
  t0.setHours(0, 0, 0, 0)
  const t1 = new Date(t0)
  t1.setDate(t1.getDate() + 3)
  d.setHours(0, 0, 0, 0)
  return d >= t0 && d <= t1
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
  }
  lojistas: LojistaListRow[]
}> {
  const { data: stores, error } = await svc.from('stores').select('*')
  if (error) throw new Error(error.message)

  const list = (stores ?? []) as Record<string, unknown>[]
  const ownerIds = [
    ...new Set(
      list.map((s) => String(s.owner_id ?? '')).filter(Boolean)
    ),
  ]

  const emailMap: Record<string, string | null> = {}
  if (ownerIds.length > 0) {
    const { data: usuarios } = await svc
      .from('usuarios')
      .select('id, email')
      .in('id', ownerIds)
    for (const u of usuarios ?? []) {
      const r = u as { id: string; email: string | null }
      emailMap[r.id] = r.email ?? null
    }
  }

  const allRows = sortLojistas(
    list.map((s) => rowToLojista(s, emailMap))
  )

  let metrics = {
    total: allRows.length,
    ativos: 0,
    pendentes: 0,
    bloqueadosCancelados: 0,
  }
  for (const r of allRows) {
    if (r.status === 'ativo') metrics.ativos++
    else if (r.status === 'pendente') metrics.pendentes++
    else if (r.status === 'bloqueado' || r.status === 'cancelado')
      metrics.bloqueadosCancelados++
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
    case 'vencendo':
      filtered = filtered.filter((r) => inExpiringWindow(r))
      break
    default:
      break
  }

  return { metrics, lojistas: filtered }
}

export async function fetchLojistaDetail(
  svc: SupabaseClient,
  id: string
): Promise<{
  lojista: LojistaListRow & {
    plano_ativado_em: string | null
    plano_atualizado_em: string | null
  }
  logs: Array<{
    id: number
    criado_em: string
    acao: string
    detalhes: string | null
  }>
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
  const lojista = {
    ...base,
    plano_ativado_em:
      typeof s.plano_ativado_em === 'string' ? s.plano_ativado_em : null,
    plano_atualizado_em:
      typeof s.plano_atualizado_em === 'string'
        ? s.plano_atualizado_em
        : null,
  }

  const { data: logs } = await svc
    .from('admin_logs')
    .select('id, criado_em, acao, detalhes')
    .eq('lojista_id', id)
    .order('criado_em', { ascending: false })

  return {
    lojista,
    logs: (logs ?? []) as Array<{
      id: number
      criado_em: string
      acao: string
      detalhes: string | null
    }>,
  }
}
