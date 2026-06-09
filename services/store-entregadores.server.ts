import 'server-only'

import type {
  EntregadorStatusOperacional,
  EntregadorTipo,
  StoreEntregadorDTO,
} from '@/lib/entregas-types'
import type { SupabaseClient } from '@supabase/supabase-js'

const ENTREGADOR_SELECT =
  'id, store_id, nome, telefone, tipo, ativo, criado_em, status_operacional, ultimo_status_em, valor_padrao_corrida'

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 100) / 100
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
  }
  return 0
}

function parseStatusOperacional(v: unknown): EntregadorStatusOperacional {
  const s = String(v ?? 'disponivel').trim().toLowerCase()
  if (s === 'em_rota') return 'em_rota'
  if (s === 'pausado') return 'pausado'
  if (s === 'indisponivel') return 'indisponivel'
  return 'disponivel'
}

function mapEntregador(row: Record<string, unknown>): StoreEntregadorDTO {
  const tipo = String(row.tipo ?? 'fixo').toLowerCase()
  return {
    id: String(row.id ?? ''),
    store_id: String(row.store_id ?? ''),
    nome: String(row.nome ?? '').trim() || '—',
    telefone:
      typeof row.telefone === 'string' && row.telefone.trim()
        ? row.telefone.trim()
        : null,
    tipo: tipo === 'autonomo' ? 'autonomo' : 'fixo',
    ativo: row.ativo !== false,
    criado_em:
      typeof row.criado_em === 'string' ? row.criado_em : new Date().toISOString(),
    status_operacional: parseStatusOperacional(row.status_operacional),
    ultimo_status_em:
      typeof row.ultimo_status_em === 'string'
        ? row.ultimo_status_em
        : new Date().toISOString(),
    valor_padrao_corrida: num(row.valor_padrao_corrida),
  }
}

export async function listEntregadoresForStore(
  svc: SupabaseClient,
  storeId: string
): Promise<StoreEntregadorDTO[]> {
  const { data, error } = await svc
    .from('store_entregadores')
    .select(ENTREGADOR_SELECT)
    .eq('store_id', storeId)
    .order('ativo', { ascending: false })
    .order('nome', { ascending: true })

  if (error) {
    if (/relation|does not exist|42P01|column.*does not exist/i.test(error.message)) {
      const { data: legacy, error: legacyErr } = await svc
        .from('store_entregadores')
        .select('id, store_id, nome, telefone, tipo, ativo, criado_em')
        .eq('store_id', storeId)
        .order('ativo', { ascending: false })
        .order('nome', { ascending: true })
      if (legacyErr) {
        if (/relation|does not exist|42P01/i.test(legacyErr.message)) return []
        throw new Error(legacyErr.message)
      }
      return (legacy ?? []).map((r) => mapEntregador(r as Record<string, unknown>))
    }
    throw new Error(error.message)
  }
  return (data ?? []).map((r) => mapEntregador(r as Record<string, unknown>))
}

export async function listEntregadoresAtivos(
  svc: SupabaseClient,
  storeId: string
): Promise<StoreEntregadorDTO[]> {
  const all = await listEntregadoresForStore(svc, storeId)
  return all.filter((e) => e.ativo)
}

export async function insertEntregador(
  svc: SupabaseClient,
  storeId: string,
  input: { nome: string; telefone: string | null; tipo: EntregadorTipo }
): Promise<StoreEntregadorDTO> {
  const { data, error } = await svc
    .from('store_entregadores')
    .insert({
      store_id: storeId,
      nome: input.nome.trim(),
      telefone: input.telefone?.trim() || null,
      tipo: input.tipo,
      ativo: true,
      status_operacional: 'disponivel',
    })
    .select(ENTREGADOR_SELECT)
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Erro ao criar entregador.')
  return mapEntregador(data as Record<string, unknown>)
}

export async function updateEntregador(
  svc: SupabaseClient,
  storeId: string,
  id: string,
  patch: Partial<{
    nome: string
    telefone: string | null
    tipo: EntregadorTipo
    ativo: boolean
    status_operacional: EntregadorStatusOperacional
    valor_padrao_corrida: number
  }>
): Promise<StoreEntregadorDTO> {
  const row: Record<string, unknown> = {}
  if (patch.nome !== undefined) row.nome = patch.nome.trim()
  if (patch.telefone !== undefined) row.telefone = patch.telefone?.trim() || null
  if (patch.tipo !== undefined) row.tipo = patch.tipo
  if (patch.ativo !== undefined) row.ativo = patch.ativo
  if (patch.status_operacional !== undefined) {
    row.status_operacional = patch.status_operacional
    row.ultimo_status_em = new Date().toISOString()
  }
  if (patch.valor_padrao_corrida !== undefined) {
    row.valor_padrao_corrida = patch.valor_padrao_corrida
  }

  const { data, error } = await svc
    .from('store_entregadores')
    .update(row)
    .eq('id', id)
    .eq('store_id', storeId)
    .select(ENTREGADOR_SELECT)
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Erro ao atualizar entregador.')
  return mapEntregador(data as Record<string, unknown>)
}

export async function setEntregadorStatusOperacional(
  svc: SupabaseClient,
  storeId: string,
  entregadorId: string,
  status: EntregadorStatusOperacional
): Promise<void> {
  const { error } = await svc
    .from('store_entregadores')
    .update({
      status_operacional: status,
      ultimo_status_em: new Date().toISOString(),
    })
    .eq('id', entregadorId)
    .eq('store_id', storeId)

  if (error && !/column.*does not exist/i.test(error.message)) {
    throw new Error(error.message)
  }
}
