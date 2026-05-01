import 'server-only'

import type { EntregadorTipo, StoreEntregadorDTO } from '@/lib/entregas-types'
import type { SupabaseClient } from '@supabase/supabase-js'

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
  }
}

export async function listEntregadoresForStore(
  svc: SupabaseClient,
  storeId: string
): Promise<StoreEntregadorDTO[]> {
  const { data, error } = await svc
    .from('store_entregadores')
    .select('id, store_id, nome, telefone, tipo, ativo, criado_em')
    .eq('store_id', storeId)
    .order('ativo', { ascending: false })
    .order('nome', { ascending: true })

  if (error) {
    if (/relation|does not exist|42P01/i.test(error.message)) return []
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
    })
    .select('id, store_id, nome, telefone, tipo, ativo, criado_em')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Erro ao criar entregador.')
  return mapEntregador(data as Record<string, unknown>)
}

export async function updateEntregador(
  svc: SupabaseClient,
  storeId: string,
  id: string,
  patch: Partial<{ nome: string; telefone: string | null; tipo: EntregadorTipo; ativo: boolean }>
): Promise<StoreEntregadorDTO> {
  const row: Record<string, unknown> = {}
  if (patch.nome !== undefined) row.nome = patch.nome.trim()
  if (patch.telefone !== undefined) row.telefone = patch.telefone?.trim() || null
  if (patch.tipo !== undefined) row.tipo = patch.tipo
  if (patch.ativo !== undefined) row.ativo = patch.ativo

  const { data, error } = await svc
    .from('store_entregadores')
    .update(row)
    .eq('id', id)
    .eq('store_id', storeId)
    .select('id, store_id, nome, telefone, tipo, ativo, criado_em')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Erro ao atualizar entregador.')
  return mapEntregador(data as Record<string, unknown>)
}
