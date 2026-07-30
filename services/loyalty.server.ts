import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  LoyaltyAccountRow,
  LoyaltyLedgerRow,
  LoyaltySummary,
  StoreLoyaltyConfig,
} from '@/lib/loyalty/types'

export function normalizePhoneE164(raw: string): string {
  return raw.replace(/\D/g, '')
}

function normalizeConfigRow(row: Record<string, unknown>): StoreLoyaltyConfig {
  return {
    store_id: String(row.store_id),
    enabled: row.enabled === true,
    points_per_real: Number(row.points_per_real ?? 1),
    min_redeem_points: Number(row.min_redeem_points ?? 100),
    redeem_cents_per_point: Number(row.redeem_cents_per_point ?? 1),
    welcome_bonus_points: Number(row.welcome_bonus_points ?? 0),
    whatsapp_balance_enabled: row.whatsapp_balance_enabled !== false,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

function normalizeAccountRow(row: Record<string, unknown>): LoyaltyAccountRow {
  return {
    store_id: String(row.store_id),
    customer_phone: String(row.customer_phone),
    customer_name: row.customer_name != null ? String(row.customer_name) : null,
    points_balance: Number(row.points_balance ?? 0),
    lifetime_earned: Number(row.lifetime_earned ?? 0),
    lifetime_redeemed: Number(row.lifetime_redeemed ?? 0),
    last_order_at: row.last_order_at != null ? String(row.last_order_at) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  }
}

function normalizeLedgerRow(row: Record<string, unknown>): LoyaltyLedgerRow {
  const kind = String(row.kind || 'adjust')
  return {
    id: String(row.id),
    store_id: String(row.store_id),
    customer_phone: String(row.customer_phone),
    kind:
      kind === 'earn' || kind === 'redeem' || kind === 'welcome' ? kind : 'adjust',
    points_delta: Number(row.points_delta ?? 0),
    order_id: row.order_id != null ? String(row.order_id) : null,
    note: row.note != null ? String(row.note) : null,
    created_at: String(row.created_at || ''),
  }
}

export async function getOrCreateLoyaltyConfig(
  db: SupabaseClient,
  storeId: string
): Promise<StoreLoyaltyConfig> {
  const { data } = await db
    .from('store_loyalty_config')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle()

  if (data) return normalizeConfigRow(data as Record<string, unknown>)

  const { data: inserted, error } = await db
    .from('store_loyalty_config')
    .insert({ store_id: storeId })
    .select('*')
    .single()

  if (error || !inserted) {
    throw new Error(error?.message || 'Falha ao criar configuração de fidelidade.')
  }
  return normalizeConfigRow(inserted as Record<string, unknown>)
}

export async function updateLoyaltyConfig(
  db: SupabaseClient,
  storeId: string,
  patch: Partial<
    Pick<
      StoreLoyaltyConfig,
      | 'enabled'
      | 'points_per_real'
      | 'min_redeem_points'
      | 'redeem_cents_per_point'
      | 'welcome_bonus_points'
      | 'whatsapp_balance_enabled'
    >
  >
): Promise<StoreLoyaltyConfig> {
  await getOrCreateLoyaltyConfig(db, storeId)
  const { data, error } = await db
    .from('store_loyalty_config')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('store_id', storeId)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Falha ao actualizar fidelidade.')
  }
  return normalizeConfigRow(data as Record<string, unknown>)
}

export async function listLoyaltyAccounts(
  db: SupabaseClient,
  storeId: string,
  limit = 50
): Promise<LoyaltyAccountRow[]> {
  const { data, error } = await db
    .from('loyalty_accounts')
    .select('*')
    .eq('store_id', storeId)
    .order('points_balance', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data || []).map((r) => normalizeAccountRow(r as Record<string, unknown>))
}

export async function listLoyaltyLedger(
  db: SupabaseClient,
  storeId: string,
  limit = 30
): Promise<LoyaltyLedgerRow[]> {
  const { data, error } = await db
    .from('loyalty_ledger')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data || []).map((r) => normalizeLedgerRow(r as Record<string, unknown>))
}

export async function getLoyaltySummary(
  db: SupabaseClient,
  storeId: string
): Promise<LoyaltySummary> {
  const { data, error } = await db
    .from('loyalty_accounts')
    .select('points_balance, lifetime_earned')
    .eq('store_id', storeId)

  if (error) throw new Error(error.message)
  const rows = data || []
  let total_points_outstanding = 0
  let total_lifetime_earned = 0
  for (const r of rows) {
    total_points_outstanding += Number((r as { points_balance?: number }).points_balance ?? 0)
    total_lifetime_earned += Number((r as { lifetime_earned?: number }).lifetime_earned ?? 0)
  }
  return {
    members_count: rows.length,
    total_points_outstanding,
    total_lifetime_earned,
  }
}

export async function adjustLoyaltyPoints(
  db: SupabaseClient,
  storeId: string,
  input: {
    customer_phone: string
    customer_name?: string | null
    points_delta: number
    note?: string | null
  }
): Promise<LoyaltyAccountRow> {
  const phone = normalizePhoneE164(input.customer_phone)
  if (!phone) throw new Error('Telefone inválido.')
  if (!input.points_delta) throw new Error('Informe pontos diferentes de zero.')

  const { data: existing } = await db
    .from('loyalty_accounts')
    .select('*')
    .eq('store_id', storeId)
    .eq('customer_phone', phone)
    .maybeSingle()

  const currentBalance = existing
    ? Number((existing as { points_balance?: number }).points_balance ?? 0)
    : 0
  const nextBalance = currentBalance + input.points_delta
  if (nextBalance < 0) throw new Error('Saldo não pode ficar negativo.')

  const now = new Date().toISOString()
  const accountPatch = {
    store_id: storeId,
    customer_phone: phone,
    customer_name: input.customer_name?.trim() || existing?.customer_name || null,
    points_balance: nextBalance,
    lifetime_earned:
      input.points_delta > 0
        ? Number((existing as { lifetime_earned?: number })?.lifetime_earned ?? 0) +
          input.points_delta
        : Number((existing as { lifetime_earned?: number })?.lifetime_earned ?? 0),
    lifetime_redeemed:
      input.points_delta < 0
        ? Number((existing as { lifetime_redeemed?: number })?.lifetime_redeemed ?? 0) -
          input.points_delta
        : Number((existing as { lifetime_redeemed?: number })?.lifetime_redeemed ?? 0),
    updated_at: now,
  }

  const { data: account, error: upsertErr } = await db
    .from('loyalty_accounts')
    .upsert(accountPatch, { onConflict: 'store_id,customer_phone' })
    .select('*')
    .single()

  if (upsertErr || !account) {
    throw new Error(upsertErr?.message || 'Falha ao actualizar saldo.')
  }

  const { error: ledgerErr } = await db.from('loyalty_ledger').insert({
    store_id: storeId,
    customer_phone: phone,
    kind: 'adjust',
    points_delta: input.points_delta,
    note: input.note?.trim() || 'Ajuste manual no painel',
  })
  if (ledgerErr) throw new Error(ledgerErr.message)

  return normalizeAccountRow(account as Record<string, unknown>)
}

/** Credita pontos após pedido entregue (plano Master + fidelidade activa). */
export async function earnLoyaltyForDeliveredOrder(
  db: SupabaseClient,
  input: {
    store_id: string
    order_id: string
    customer_phone: string | null | undefined
    customer_name: string | null | undefined
    order_total: number
    order_created_at?: string
  }
): Promise<void> {
  const phone = normalizePhoneE164(String(input.customer_phone || ''))
  if (!phone || input.order_total <= 0) return

  const config = await getOrCreateLoyaltyConfig(db, input.store_id)
  if (!config.enabled) return

  const points = Math.floor(input.order_total * config.points_per_real)
  if (points <= 0) return

  const { data: existing } = await db
    .from('loyalty_ledger')
    .select('id')
    .eq('store_id', input.store_id)
    .eq('order_id', input.order_id)
    .eq('kind', 'earn')
    .maybeSingle()

  if (existing) return

  const { data: accountRow } = await db
    .from('loyalty_accounts')
    .select('*')
    .eq('store_id', input.store_id)
    .eq('customer_phone', phone)
    .maybeSingle()

  const currentBalance = accountRow
    ? Number((accountRow as { points_balance?: number }).points_balance ?? 0)
    : 0
  const nextBalance = currentBalance + points
  const now = new Date().toISOString()

  await db.from('loyalty_accounts').upsert(
    {
      store_id: input.store_id,
      customer_phone: phone,
      customer_name:
        input.customer_name?.trim() ||
        (accountRow as { customer_name?: string } | null)?.customer_name ||
        null,
      points_balance: nextBalance,
      lifetime_earned:
        Number((accountRow as { lifetime_earned?: number } | null)?.lifetime_earned ?? 0) +
        points,
      lifetime_redeemed: Number(
        (accountRow as { lifetime_redeemed?: number } | null)?.lifetime_redeemed ?? 0
      ),
      last_order_at: input.order_created_at || now,
      updated_at: now,
    },
    { onConflict: 'store_id,customer_phone' }
  )

  await db.from('loyalty_ledger').insert({
    store_id: input.store_id,
    customer_phone: phone,
    kind: 'earn',
    points_delta: points,
    order_id: input.order_id,
    note: `Pedido entregue`,
  })
}
