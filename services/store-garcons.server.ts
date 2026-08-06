import 'server-only'

import { normalizeGarcomPin, isGarcomPinActive, isSalaoGarcomPinRequired } from '@/lib/garcom-pin'
import type { StoreGarcomDTO } from '@/lib/garcons-types'
import type { SupabaseClient } from '@supabase/supabase-js'

const GARCOM_SELECT =
  'id, store_id, nome, email, telefone, ativo, pin, pin_ativo, criado_em'

function mapGarcom(row: Record<string, unknown>): StoreGarcomDTO {
  const pinRaw = typeof row.pin === 'string' ? normalizeGarcomPin(row.pin) : ''
  return {
    id: String(row.id ?? ''),
    store_id: String(row.store_id ?? ''),
    nome: String(row.nome ?? '').trim() || '—',
    email:
      typeof row.email === 'string' && row.email.trim() ? row.email.trim() : null,
    telefone:
      typeof row.telefone === 'string' && row.telefone.trim()
        ? row.telefone.trim()
        : null,
    ativo: row.ativo !== false,
    pin: pinRaw.length === 4 ? pinRaw : null,
    pin_ativo: row.pin_ativo === true,
    criado_em:
      typeof row.criado_em === 'string' ? row.criado_em : new Date().toISOString(),
  }
}

function parsePinFields(input: {
  pin?: unknown
  pin_ativo?: unknown
}): { pin: string | null; pin_ativo: boolean } {
  const pin = normalizeGarcomPin(input.pin)
  const pin_ativo = input.pin_ativo === true
  if (pin_ativo && pin.length !== 4) {
    throw new Error('O PIN do garçom deve ter 4 números quando estiver ativo.')
  }
  return {
    pin: pin_ativo && pin.length === 4 ? pin : null,
    pin_ativo: pin_ativo && pin.length === 4,
  }
}

async function assertUniqueGarcomPin(
  svc: SupabaseClient,
  storeId: string,
  pin: string | null,
  excludeId?: string
): Promise<void> {
  if (!pin) return
  const { data, error } = await svc
    .from('store_garcons')
    .select('id, nome')
    .eq('store_id', storeId)
    .eq('pin', pin)
    .eq('pin_ativo', true)

  if (error) throw new Error(error.message)
  const conflict = (data ?? []).find((row) => String(row.id) !== excludeId)
  if (conflict) {
    throw new Error('Este PIN já está em uso por outro garçom ativo.')
  }
}

async function assertUniqueGarcomNome(
  svc: SupabaseClient,
  storeId: string,
  nome: string,
  excludeId?: string
): Promise<void> {
  const normalized = nome.trim().toLowerCase()
  if (!normalized) return

  const { data, error } = await svc
    .from('store_garcons')
    .select('id, nome')
    .eq('store_id', storeId)
    .eq('ativo', true)

  if (error) throw new Error(error.message)
  const conflict = (data ?? []).find(
    (row) =>
      String(row.id) !== excludeId &&
      String(row.nome ?? '').trim().toLowerCase() === normalized
  )
  if (conflict) {
    throw new Error('Já existe um garçom ativo com este nome.')
  }
}

export async function listGarconsForStore(
  svc: SupabaseClient,
  storeId: string
): Promise<StoreGarcomDTO[]> {
  const { data, error } = await svc
    .from('store_garcons')
    .select(GARCOM_SELECT)
    .eq('store_id', storeId)
    .order('ativo', { ascending: false })
    .order('nome', { ascending: true })

  if (error) {
    if (/relation|does not exist|42P01/i.test(error.message)) return []
    throw new Error(error.message)
  }
  return (data ?? []).map((r) => mapGarcom(r as Record<string, unknown>))
}

export async function insertGarcom(
  svc: SupabaseClient,
  storeId: string,
  input: {
    nome: string
    email: string | null
    telefone: string | null
    pin?: unknown
    pin_ativo?: unknown
  }
): Promise<StoreGarcomDTO> {
  const pinFields = parsePinFields(input)
  await assertUniqueGarcomPin(svc, storeId, pinFields.pin)
  await assertUniqueGarcomNome(svc, storeId, input.nome)

  const { data, error } = await svc
    .from('store_garcons')
    .insert({
      store_id: storeId,
      nome: input.nome.trim(),
      email: input.email?.trim() || null,
      telefone: input.telefone?.trim() || null,
      ativo: true,
      pin: pinFields.pin,
      pin_ativo: pinFields.pin_ativo,
    })
    .select(GARCOM_SELECT)
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Erro ao criar garçom.')
  return mapGarcom(data as Record<string, unknown>)
}

export async function updateGarcom(
  svc: SupabaseClient,
  storeId: string,
  id: string,
  patch: Partial<{
    nome: string
    email: string | null
    telefone: string | null
    ativo: boolean
    pin: string | null
    pin_ativo: boolean
  }>
): Promise<StoreGarcomDTO> {
  const row: Record<string, unknown> = {}
  if (patch.nome !== undefined) row.nome = patch.nome.trim()
  if (patch.email !== undefined) row.email = patch.email?.trim() || null
  if (patch.telefone !== undefined) row.telefone = patch.telefone?.trim() || null
  if (patch.ativo !== undefined) row.ativo = patch.ativo
  if (patch.pin !== undefined) row.pin = patch.pin
  if (patch.pin_ativo !== undefined) row.pin_ativo = patch.pin_ativo

  if (patch.pin !== undefined || patch.pin_ativo !== undefined) {
    const pinFields = parsePinFields({
      pin: patch.pin,
      pin_ativo: patch.pin_ativo ?? false,
    })
    row.pin = pinFields.pin
    row.pin_ativo = pinFields.pin_ativo
    await assertUniqueGarcomPin(svc, storeId, pinFields.pin, id)
  }

  if (patch.nome !== undefined) {
    await assertUniqueGarcomNome(svc, storeId, patch.nome, id)
  }

  const { data, error } = await svc
    .from('store_garcons')
    .update(row)
    .eq('id', id)
    .eq('store_id', storeId)
    .select(GARCOM_SELECT)
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Erro ao atualizar garçom.')
  return mapGarcom(data as Record<string, unknown>)
}

export async function resolveGarcomForOrder(
  svc: SupabaseClient,
  storeId: string,
  garcomId: string | null | undefined
): Promise<{ garcom_id: string | null; garcom_nome: string | null }> {
  const id = typeof garcomId === 'string' ? garcomId.trim() : ''
  if (!id) return { garcom_id: null, garcom_nome: null }

  const { data, error } = await svc
    .from('store_garcons')
    .select('id, nome, ativo')
    .eq('store_id', storeId)
    .eq('id', id)
    .maybeSingle()

  if (error || !data || data.ativo === false) {
    return { garcom_id: null, garcom_nome: null }
  }

  return {
    garcom_id: String(data.id),
    garcom_nome: String(data.nome ?? '').trim() || '—',
  }
}

export type GarcomWaiterResolve =
  | { garcom_id: string; garcom_nome: string }
  | { garcom_id: null; garcom_nome: null }

/** Valida garçom para pedidos do painel (exige PIN activo quando a loja usa PIN). */
export async function resolveGarcomForWaiterOrder(
  svc: SupabaseClient,
  storeId: string,
  garcomId: string | null | undefined
): Promise<GarcomWaiterResolve | { error: string; status: number }> {
  const garcons = await listGarconsForStore(svc, storeId)
  const pinRequired = isSalaoGarcomPinRequired(garcons)
  const id = typeof garcomId === 'string' ? garcomId.trim() : ''

  if (pinRequired) {
    if (!id) {
      return {
        error: 'Informa o garçom (PIN obrigatório nesta loja).',
        status: 400,
      }
    }
    const g = garcons.find((row) => row.id === id)
    if (!g || !isGarcomPinActive(g)) {
      return { error: 'Garçom inválido ou sem PIN activo.', status: 403 }
    }
    return { garcom_id: g.id, garcom_nome: g.nome.trim() || '—' }
  }

  const resolved = await resolveGarcomForOrder(svc, storeId, id)
  if (!resolved.garcom_id) {
    return { garcom_id: null, garcom_nome: null }
  }
  return {
    garcom_id: resolved.garcom_id,
    garcom_nome: resolved.garcom_nome ?? '—',
  }
}
