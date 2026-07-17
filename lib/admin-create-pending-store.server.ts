import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveUniqueStoreSlug } from '@/lib/store-slug.server'
import { slugifyStoreSlug } from '@/lib/store-slug'

function cleanName(v: string | null | undefined, fallback: string): string {
  const t = typeof v === 'string' ? v.trim() : ''
  return t || fallback
}

async function ownerMissingFromAuth(
  svc: SupabaseClient,
  ownerId: string
): Promise<boolean> {
  const id = ownerId.trim()
  if (!id) return true
  const { data, error } = await svc.auth.admin.getUserById(id)
  return Boolean(error) || !data?.user
}

/**
 * Garante uma loja pendente para um utilizador Auth.
 * Se já existir loja do owner → devolve-a.
 * Se existir loja “fantasma” (nome parecido + dono em falta) → religa o owner.
 */
export async function createOrRelinkPendingStoreForAuthUser(
  svc: SupabaseClient,
  input: {
    userId: string
    email: string | null
    storeName?: string | null
    phone?: string | null
    operationMode?: string | null
  }
): Promise<{ storeId: string; created: boolean; relinked: boolean }> {
  const userId = input.userId

  const { data: existing } = await svc
    .from('stores')
    .select('id')
    .eq('owner_id', userId)
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    return { storeId: String(existing.id), created: false, relinked: false }
  }

  const name = cleanName(
    input.storeName,
    input.email ? `Loja de ${input.email.split('@')[0]}` : 'Nova loja'
  )

  // Tenta religar loja fantasma pelo nome (ex.: cadastro antigo / owner apagado).
  const searchToken = name.replace(/[%_]/g, '').slice(0, 48)
  if (searchToken.length >= 3) {
    const { data: candidates } = await svc
      .from('stores')
      .select('id, name, owner_id')
      .ilike('name', `%${searchToken}%`)
      .limit(20)

    for (const row of candidates ?? []) {
      const storeId = String((row as { id?: string }).id ?? '')
      const ownerId = String((row as { owner_id?: string }).owner_id ?? '').trim()
      if (!storeId) continue
      if (!(await ownerMissingFromAuth(svc, ownerId))) continue

      const patch: Record<string, unknown> = {
        owner_id: userId,
        status: 'pendente',
      }
      let { error } = await svc
        .from('stores')
        .update({ ...patch, merchant_status: 'pendente' })
        .eq('id', storeId)
      if (error && /merchant_status|column|schema cache/i.test(error.message)) {
        ;({ error } = await svc.from('stores').update(patch).eq('id', storeId))
      }
      if (!error) {
        return { storeId, created: false, relinked: true }
      }
    }
  }

  const uniqueSlug = await resolveUniqueStoreSlug(svc, slugifyStoreSlug(name))
  const baseRow: Record<string, unknown> = {
    name,
    slug: uniqueSlug,
    owner_id: userId,
    status: 'pendente',
    merchant_status: 'pendente',
    plano: 'growth',
    operation_mode:
      input.operationMode === 'delivery' ||
      input.operationMode === 'presencial' ||
      input.operationMode === 'hibrido'
        ? input.operationMode
        : 'hibrido',
    ...(input.phone ? { phone: input.phone } : {}),
  }

  let { data, error } = await svc.from('stores').insert(baseRow).select('id').single()
  if (error && /merchant_status|column|schema cache/i.test(error.message)) {
    const { merchant_status: _m, ...rest } = baseRow
    void _m
    ;({ data, error } = await svc.from('stores').insert(rest).select('id').single())
  }
  if (error && /operation_mode|column|schema cache/i.test(error.message)) {
    const { operation_mode: _o, merchant_status: _m, ...rest } = baseRow
    void _o
    void _m
    ;({ data, error } = await svc
      .from('stores')
      .insert({ ...rest, status: 'pendente' })
      .select('id')
      .single())
  }
  if (error || !data?.id) {
    throw new Error(error?.message ?? 'Erro ao criar loja.')
  }

  return { storeId: String(data.id), created: true, relinked: false }
}
