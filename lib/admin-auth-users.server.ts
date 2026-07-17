import 'server-only'

import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { AdminAuthUserDTO } from '@/lib/admin-auth-users-types'

export type { AdminAuthUserDTO } from '@/lib/admin-auth-users-types'

function intendedStoreNameFromUser(u: User): string | null {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  const raw =
    typeof meta.store_name === 'string'
      ? meta.store_name
      : typeof meta.storeName === 'string'
        ? meta.storeName
        : typeof meta.name === 'string'
          ? meta.name
          : null
  const t = raw?.trim()
  return t || null
}

async function listAllAuthUsers(svc: SupabaseClient): Promise<User[]> {
  const all: User[] = []
  for (let page = 1; page <= 200; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const users = data?.users ?? []
    all.push(...users)
    if (users.length < 200) break
  }
  return all
}

export async function fetchAuthUsersForAdmin(
  svc: SupabaseClient,
  q = ''
): Promise<{ total: number; withStore: number; withoutStore: number; users: AdminAuthUserDTO[] }> {
  const authUsers = await listAllAuthUsers(svc)
  const ownerIds = authUsers.map((u) => u.id)

  const storeByOwner = new Map<
    string,
    { id: string; name: string | null; slug: string | null; status: string | null }
  >()

  if (ownerIds.length > 0) {
    const chunkSize = 150
    for (let i = 0; i < ownerIds.length; i += chunkSize) {
      const chunk = ownerIds.slice(i, i + chunkSize)
      const { data, error } = await svc
        .from('stores')
        .select('id, name, slug, status, merchant_status, owner_id')
        .in('owner_id', chunk)
      if (error) {
        if (/merchant_status|column|schema cache/i.test(error.message)) {
          const fallback = await svc
            .from('stores')
            .select('id, name, slug, status, owner_id')
            .in('owner_id', chunk)
          if (fallback.error) throw new Error(fallback.error.message)
          for (const row of fallback.data ?? []) {
            const ownerId = String((row as { owner_id?: string }).owner_id ?? '')
            if (!ownerId || storeByOwner.has(ownerId)) continue
            storeByOwner.set(ownerId, {
              id: String((row as { id?: string }).id ?? ''),
              name:
                typeof (row as { name?: unknown }).name === 'string'
                  ? (row as { name: string }).name
                  : null,
              slug:
                typeof (row as { slug?: unknown }).slug === 'string'
                  ? (row as { slug: string }).slug
                  : null,
              status:
                typeof (row as { status?: unknown }).status === 'string'
                  ? (row as { status: string }).status
                  : null,
            })
          }
          continue
        }
        throw new Error(error.message)
      }
      for (const row of data ?? []) {
        const ownerId = String((row as { owner_id?: string }).owner_id ?? '')
        if (!ownerId || storeByOwner.has(ownerId)) continue
        const statusRaw =
          typeof (row as { status?: unknown }).status === 'string' &&
          String((row as { status: string }).status).trim()
            ? (row as { status: string }).status
            : typeof (row as { merchant_status?: unknown }).merchant_status === 'string'
              ? (row as { merchant_status: string }).merchant_status
              : null
        storeByOwner.set(ownerId, {
          id: String((row as { id?: string }).id ?? ''),
          name:
            typeof (row as { name?: unknown }).name === 'string'
              ? (row as { name: string }).name
              : null,
          slug:
            typeof (row as { slug?: unknown }).slug === 'string'
              ? (row as { slug: string }).slug
              : null,
          status: statusRaw,
        })
      }
    }
  }

  const needle = q.trim().toLowerCase()
  const users: AdminAuthUserDTO[] = authUsers
    .map((u) => {
      const store = storeByOwner.get(u.id) ?? null
      const bannedUntil = (u as { banned_until?: string | null }).banned_until
      const intended = intendedStoreNameFromUser(u)
      return {
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        email_confirmed_at: u.email_confirmed_at ?? null,
        banned: Boolean(bannedUntil),
        intended_store_name: intended,
        store_id: store?.id ?? null,
        store_name: store?.name ?? null,
        store_slug: store?.slug ?? null,
        store_status: store?.status ?? null,
      }
    })
    .filter((u) => {
      if (!needle) return true
      const hay = [
        u.email ?? '',
        u.store_name ?? '',
        u.store_slug ?? '',
        u.intended_store_name ?? '',
        u.id,
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
    .sort((a, b) => {
      // Órfãos (sem loja) primeiro — são os que costumam “sumir” do painel Lojistas.
      const aOrphan = a.store_id ? 1 : 0
      const bOrphan = b.store_id ? 1 : 0
      if (aOrphan !== bOrphan) return aOrphan - bOrphan
      const at = a.created_at ? new Date(a.created_at).getTime() : 0
      const bt = b.created_at ? new Date(b.created_at).getTime() : 0
      return bt - at
    })

  const withStore = users.filter((u) => u.store_id).length
  return {
    total: users.length,
    withStore,
    withoutStore: users.length - withStore,
    users,
  }
}
