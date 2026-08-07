import { readFileSync } from 'fs'
import path from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { E2E_STORE_ID, E2E_STORE_SLUG } from '../fixtures/store'
import { parsePlan } from '../../lib/plan'
import { publicDineInCheckoutAllowed } from '../../lib/salao-attendance'

function loadEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    const raw = readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      const k = t.slice(0, i).trim()
      let v = t.slice(i + 1).trim()
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      }
      out[k] = v
    }
  } catch {
    /* optional */
  }
  return out
}

const env = { ...loadEnvLocal(), ...process.env }

export function getSupabaseAdmin(): SupabaseClient {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios em .env.local para test:sync'
    )
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function getSupabaseAnon() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY ausente')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function createMagicLinkSession(email: string, redirectTo: string) {
  const admin = getSupabaseAdmin()
  const anon = getSupabaseAnon()
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  })
  if (error || !data?.properties?.hashed_token) {
    throw new Error(`generateLink falhou: ${error?.message ?? 'sem token'}`)
  }
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'email',
  })
  if (verifyError || !verified.session) {
    throw new Error(`verifyOtp falhou: ${verifyError?.message ?? 'sem sessão'}`)
  }
  return verified.session
}

export async function loadE2eTestData(): Promise<import('../fixtures/store').E2eTestData> {
  const sb = getSupabaseAdmin()
  const { data: store, error } = await sb
    .from('stores')
    .select('*')
    .eq('slug', E2E_STORE_SLUG)
    .single()
  if (error || !store) {
    throw new Error(`Loja ${E2E_STORE_SLUG} não encontrada: ${error?.message}`)
  }

  const { data: owner } = await sb.auth.admin.getUserById(String(store.owner_id))
  const email = owner?.user?.email
  if (!email) throw new Error('Email do dono da loja não encontrado')

  const { data: garcons } = await sb
    .from('store_garcons')
    .select('id, nome, pin, pin_ativo, ativo')
    .eq('store_id', E2E_STORE_ID)
    .eq('ativo', true)
    .eq('pin_ativo', true)
    .order('nome')

  const operationMode = String(store.operation_mode ?? '')

  const { data: order } = await sb
    .from('orders')
    .select('id, status, source')
    .eq('store_id', E2E_STORE_ID)
    .in('status', ['pending', 'preparing', 'ready', 'confirmed'])
    .order('created_at', { ascending: false })
    .limit(20)

  const presencialSources = new Set(['pdv', 'waiter', 'autoatendimento'])
  const syncableStatuses = new Set(['pending', 'preparing', 'ready', 'confirmed'])
  const sampleOrder =
    (order ?? []).find((o) => {
      const source = String(o.source ?? '').toLowerCase()
      const status = String(o.status ?? '').toLowerCase()
      if (!syncableStatuses.has(status)) return false
      if (operationMode === 'presencial') return presencialSources.has(source)
      if (operationMode === 'delivery') return !presencialSources.has(source)
      return true
    }) ?? order?.[0] ?? null

  const plan = parsePlan(store.plano)
  const publicDineInAllowed = publicDineInCheckoutAllowed(
    plan,
    store as Record<string, unknown>
  )

  return {
    storeId: E2E_STORE_ID,
    slug: E2E_STORE_SLUG,
    ownerEmail: email,
    sampleOrderId: sampleOrder?.id ?? null,
    garcoms: (garcons ?? [])
      .filter((g) => /^\d{4}$/.test(String(g.pin ?? '')))
      .map((g) => ({
        id: String(g.id),
        nome: String(g.nome),
        pin: String(g.pin),
      })),
    plano: String(store.plano ?? ''),
    operationMode,
    salaoAttendanceMode: String(store.salao_attendance_mode ?? ''),
    publicDineInAllowed,
    hubPinBalcaoEnabled: Boolean(store.hub_pin_balcao_enabled),
    hubPinBalcao:
      store.hub_pin_balcao_enabled && /^\d{4}$/.test(String(store.hub_pin_balcao ?? ''))
        ? String(store.hub_pin_balcao)
        : null,
  }
}
