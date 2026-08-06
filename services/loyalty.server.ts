import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CustomerLoyaltyBalance,
  LoyaltyAccountRow,
  LoyaltyDeliveredEarnResult,
  LoyaltyLedgerRow,
  LoyaltySummary,
  PublicLoyaltyProgram,
  StoreLoyaltyConfig,
} from '@/lib/loyalty/types'
import {
  calculateEarnPoints,
  calculateMaxRedeemablePoints,
  resolveRedeemPoints,
} from '@/lib/loyalty/utils'
import { sendLoyaltyDeliveredWhatsAppNotification } from '@/services/loyalty-whatsapp.server'

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
    throw new Error(error?.message || 'Falha ao atualizar fidelidade.')
  }
  return normalizeConfigRow(data as Record<string, unknown>)
}

export async function listLoyaltyAccounts(
  db: SupabaseClient,
  storeId: string,
  options?: { limit?: number; search?: string }
): Promise<LoyaltyAccountRow[]> {
  const limit = Math.min(200, Math.max(1, options?.limit ?? 50))
  const search = options?.search?.trim() || ''

  let query = db
    .from('loyalty_accounts')
    .select('*')
    .eq('store_id', storeId)
    .order('points_balance', { ascending: false })
    .limit(limit)

  if (search) {
    const digits = normalizePhoneE164(search)
    if (digits.length >= 4) {
      query = query.or(
        `customer_phone.ilike.%${digits}%,customer_name.ilike.%${search}%`
      )
    } else {
      query = query.ilike('customer_name', `%${search}%`)
    }
  }

  const { data, error } = await query
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
    .limit(Math.min(100, Math.max(1, limit)))

  if (error) throw new Error(error.message)
  return (data || []).map((r) => normalizeLedgerRow(r as Record<string, unknown>))
}

export async function getLoyaltySummary(
  db: SupabaseClient,
  storeId: string,
  config?: StoreLoyaltyConfig
): Promise<LoyaltySummary> {
  const cfg = config ?? (await getOrCreateLoyaltyConfig(db, storeId))

  const { data, error } = await db
    .from('loyalty_accounts')
    .select('points_balance, lifetime_earned, lifetime_redeemed')
    .eq('store_id', storeId)

  if (error) throw new Error(error.message)
  const rows = data || []
  let total_points_outstanding = 0
  let total_lifetime_earned = 0
  let total_lifetime_redeemed = 0
  for (const r of rows) {
    total_points_outstanding += Number((r as { points_balance?: number }).points_balance ?? 0)
    total_lifetime_earned += Number((r as { lifetime_earned?: number }).lifetime_earned ?? 0)
    total_lifetime_redeemed += Number((r as { lifetime_redeemed?: number }).lifetime_redeemed ?? 0)
  }

  return {
    members_count: rows.length,
    total_points_outstanding,
    total_lifetime_earned,
    total_lifetime_redeemed,
    liability_brl:
      Math.round(
        ((total_points_outstanding * cfg.redeem_cents_per_point) / 100) * 100
      ) / 100,
  }
}

export function toPublicLoyaltyProgram(config: StoreLoyaltyConfig): PublicLoyaltyProgram {
  return {
    enabled: config.enabled,
    points_per_real: config.points_per_real,
    min_redeem_points: config.min_redeem_points,
    redeem_cents_per_point: config.redeem_cents_per_point,
  }
}

export async function getCustomerLoyaltyBalance(
  db: SupabaseClient,
  storeId: string,
  customerPhone: string,
  orderTotalBrl = 0
): Promise<CustomerLoyaltyBalance | null> {
  const config = await getOrCreateLoyaltyConfig(db, storeId)
  if (!config.enabled) return null

  const phone = normalizePhoneE164(customerPhone)
  if (!phone) return null

  const { data: account } = await db
    .from('loyalty_accounts')
    .select('points_balance')
    .eq('store_id', storeId)
    .eq('customer_phone', phone)
    .maybeSingle()

  const balance = Number((account as { points_balance?: number } | null)?.points_balance ?? 0)
  const maxRedeem = calculateMaxRedeemablePoints(config, balance, orderTotalBrl)

  return {
    balance,
    can_redeem: maxRedeem >= config.min_redeem_points,
    max_redeem_points: maxRedeem,
    max_discount_brl:
      Math.round(((maxRedeem * config.redeem_cents_per_point) / 100) * 100) / 100,
    min_redeem_points: config.min_redeem_points,
    redeem_cents_per_point: config.redeem_cents_per_point,
  }
}

async function maybeAwardWelcomeBonus(
  db: SupabaseClient,
  input: {
    store_id: string
    customer_phone: string
    customer_name: string | null | undefined
    config: StoreLoyaltyConfig
    accountRow: Record<string, unknown> | null
  }
): Promise<number> {
  const bonus = Math.floor(input.config.welcome_bonus_points)
  if (!input.config.enabled || bonus <= 0) return 0

  const { data: existingWelcome } = await db
    .from('loyalty_ledger')
    .select('id')
    .eq('store_id', input.store_id)
    .eq('customer_phone', input.customer_phone)
    .eq('kind', 'welcome')
    .maybeSingle()

  if (existingWelcome) return 0

  const currentBalance = input.accountRow
    ? Number((input.accountRow as { points_balance?: number }).points_balance ?? 0)
    : 0
  const now = new Date().toISOString()

  await db.from('loyalty_accounts').upsert(
    {
      store_id: input.store_id,
      customer_phone: input.customer_phone,
      customer_name:
        input.customer_name?.trim() ||
        (input.accountRow as { customer_name?: string } | null)?.customer_name ||
        null,
      points_balance: currentBalance + bonus,
      lifetime_earned:
        Number((input.accountRow as { lifetime_earned?: number } | null)?.lifetime_earned ?? 0) +
        bonus,
      lifetime_redeemed: Number(
        (input.accountRow as { lifetime_redeemed?: number } | null)?.lifetime_redeemed ?? 0
      ),
      updated_at: now,
    },
    { onConflict: 'store_id,customer_phone' }
  )

  await db.from('loyalty_ledger').insert({
    store_id: input.store_id,
    customer_phone: input.customer_phone,
    kind: 'welcome',
    points_delta: bonus,
    note: 'Bónus de boas-vindas',
  })

  return bonus
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

  let account: Record<string, unknown> | null = null
  let upsertErr: { message?: string } | null = null

  if (input.points_delta < 0) {
    const debit = Math.abs(input.points_delta)
    if (existing) {
      const { data, error } = await db
        .from('loyalty_accounts')
        .update(accountPatch)
        .eq('store_id', storeId)
        .eq('customer_phone', phone)
        .gte('points_balance', debit)
        .select('*')
        .maybeSingle()
      account = data as Record<string, unknown> | null
      upsertErr = error
      if (!account && !error) {
        throw new Error('Saldo insuficiente para este ajuste.')
      }
    } else {
      throw new Error('Saldo insuficiente para este ajuste.')
    }
  } else {
    const { data, error } = await db
      .from('loyalty_accounts')
      .upsert(accountPatch, { onConflict: 'store_id,customer_phone' })
      .select('*')
      .single()
    account = data as Record<string, unknown> | null
    upsertErr = error
  }

  if (upsertErr || !account) {
    throw new Error(upsertErr?.message || 'Falha ao atualizar saldo.')
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

/** Resgata pontos no checkout público (antes de criar o pedido). */
export async function redeemLoyaltyPointsForCheckout(
  db: SupabaseClient,
  input: {
    store_id: string
    order_id: string
    customer_phone: string
    customer_name?: string | null
    order_total_before_discount: number
    requested_points: number
  }
): Promise<{ points: number; discount_brl: number }> {
  const phone = normalizePhoneE164(input.customer_phone)
  if (!phone) throw new Error('Telefone inválido para fidelidade.')

  const config = await getOrCreateLoyaltyConfig(db, input.store_id)
  if (!config.enabled) throw new Error('Programa de fidelidade inativo.')

  const { data: existingRedeem } = await db
    .from('loyalty_ledger')
    .select('id')
    .eq('store_id', input.store_id)
    .eq('order_id', input.order_id)
    .eq('kind', 'redeem')
    .maybeSingle()

  if (existingRedeem) {
    throw new Error('Pontos já resgatados para este pedido.')
  }

  const { data: accountRow } = await db
    .from('loyalty_accounts')
    .select('*')
    .eq('store_id', input.store_id)
    .eq('customer_phone', phone)
    .maybeSingle()

  const balance = Number((accountRow as { points_balance?: number } | null)?.points_balance ?? 0)
  const { points, discountBrl } = resolveRedeemPoints(
    config,
    balance,
    input.order_total_before_discount,
    input.requested_points
  )

  if (points <= 0) {
    throw new Error(
      `Mínimo de ${config.min_redeem_points} pontos para resgatar ou saldo insuficiente.`
    )
  }

  const nextBalance = balance - points
  const now = new Date().toISOString()

  const accountPatch = {
    store_id: input.store_id,
    customer_phone: phone,
    customer_name:
      input.customer_name?.trim() ||
      (accountRow as { customer_name?: string } | null)?.customer_name ||
      null,
    points_balance: nextBalance,
    lifetime_earned: Number(
      (accountRow as { lifetime_earned?: number } | null)?.lifetime_earned ?? 0
    ),
    lifetime_redeemed:
      Number((accountRow as { lifetime_redeemed?: number } | null)?.lifetime_redeemed ?? 0) +
      points,
    updated_at: now,
  }

  let upsertErr: { message?: string } | null = null

  if (accountRow) {
    const { data: debited, error } = await db
      .from('loyalty_accounts')
      .update(accountPatch)
      .eq('store_id', input.store_id)
      .eq('customer_phone', phone)
      .gte('points_balance', points)
      .select('customer_phone')
      .maybeSingle()
    upsertErr = error
    if (!debited && !error) {
      throw new Error('Saldo insuficiente para resgatar os pontos pedidos.')
    }
  } else {
    throw new Error('Saldo insuficiente para resgatar os pontos pedidos.')
  }

  if (upsertErr) throw new Error(upsertErr.message)

  const { error: ledgerErr } = await db.from('loyalty_ledger').insert({
    store_id: input.store_id,
    customer_phone: phone,
    kind: 'redeem',
    points_delta: -points,
    order_id: input.order_id,
    note: `Resgate no checkout (−R$ ${discountBrl.toFixed(2)})`,
  })

  if (ledgerErr) throw new Error(ledgerErr.message)

  return { points, discount_brl: discountBrl }
}

/** Credita pontos após pedido entregue (fidelidade activa). */
export async function earnLoyaltyForDeliveredOrder(
  db: SupabaseClient,
  input: {
    store_id: string
    order_id: string
    customer_phone: string | null | undefined
    customer_name: string | null | undefined
    order_total: number
    order_created_at?: string
    points_per_real?: number | null
  }
): Promise<LoyaltyDeliveredEarnResult | null> {
  const phone = normalizePhoneE164(String(input.customer_phone || ''))
  if (!phone) return null

  const config = await getOrCreateLoyaltyConfig(db, input.store_id)
  if (!config.enabled) return null

  const { data: existingEarn } = await db
    .from('loyalty_ledger')
    .select('id')
    .eq('store_id', input.store_id)
    .eq('order_id', input.order_id)
    .eq('kind', 'earn')
    .maybeSingle()

  if (existingEarn) return null

  const rate =
    input.points_per_real != null && Number.isFinite(Number(input.points_per_real))
      ? Number(input.points_per_real)
      : config.points_per_real

  const points =
    input.order_total > 0 ? calculateEarnPoints(input.order_total, rate) : 0

  if (points <= 0 && config.welcome_bonus_points <= 0) return null

  const { data: accountRow } = await db
    .from('loyalty_accounts')
    .select('*')
    .eq('store_id', input.store_id)
    .eq('customer_phone', phone)
    .maybeSingle()

  const welcomeBonus = await maybeAwardWelcomeBonus(db, {
    store_id: input.store_id,
    customer_phone: phone,
    customer_name: input.customer_name,
    config,
    accountRow: (accountRow as Record<string, unknown> | null) ?? null,
  })

  if (points > 0) {
    const { data: freshAccount } = await db
      .from('loyalty_accounts')
      .select('*')
      .eq('store_id', input.store_id)
      .eq('customer_phone', phone)
      .maybeSingle()

    const currentBalance = freshAccount
      ? Number((freshAccount as { points_balance?: number }).points_balance ?? 0)
      : 0
    const nextBalance = currentBalance + points
    const now = new Date().toISOString()

    await db.from('loyalty_accounts').upsert(
      {
        store_id: input.store_id,
        customer_phone: phone,
        customer_name:
          input.customer_name?.trim() ||
          (freshAccount as { customer_name?: string } | null)?.customer_name ||
          null,
        points_balance: nextBalance,
        lifetime_earned:
          Number((freshAccount as { lifetime_earned?: number } | null)?.lifetime_earned ?? 0) +
          points,
        lifetime_redeemed: Number(
          (freshAccount as { lifetime_redeemed?: number } | null)?.lifetime_redeemed ?? 0
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
      note: 'Pedido entregue',
    })
  }

  if (points <= 0 && welcomeBonus <= 0) return null

  const { data: finalAccount } = await db
    .from('loyalty_accounts')
    .select('points_balance, customer_name')
    .eq('store_id', input.store_id)
    .eq('customer_phone', phone)
    .maybeSingle()

  return {
    customer_phone: phone,
    customer_name:
      input.customer_name?.trim() ||
      (finalAccount as { customer_name?: string } | null)?.customer_name ||
      null,
    points_earned: points,
    welcome_bonus: welcomeBonus,
    new_balance: Number(
      (finalAccount as { points_balance?: number } | null)?.points_balance ?? 0
    ),
    order_ref: `#${input.order_id.slice(0, 8).toUpperCase()}`,
  }
}

/** Estorna pontos resgatados quando um pedido é cancelado. */
export async function reverseLoyaltyRedeemForCancelledOrder(
  db: SupabaseClient,
  storeId: string,
  orderId: string
): Promise<void> {
  const { data: order } = await db
    .from('orders')
    .select('loyalty_redeem_points, customer_phone, customer_name')
    .eq('id', orderId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (!order) return

  const points = Math.max(
    0,
    Math.floor(Number((order as { loyalty_redeem_points?: number }).loyalty_redeem_points ?? 0))
  )
  if (points <= 0) return

  const phone = normalizePhoneE164(
    String((order as { customer_phone?: string | null }).customer_phone ?? '')
  )
  if (!phone) return

  const { data: existingReverse } = await db
    .from('loyalty_ledger')
    .select('id')
    .eq('store_id', storeId)
    .eq('order_id', orderId)
    .eq('kind', 'adjust')
    .ilike('note', '%Estorno resgate%')
    .maybeSingle()

  if (existingReverse) return

  const { data: accountRow } = await db
    .from('loyalty_accounts')
    .select('points_balance, lifetime_redeemed, customer_name')
    .eq('store_id', storeId)
    .eq('customer_phone', phone)
    .maybeSingle()

  const currentBalance = Number(
    (accountRow as { points_balance?: number } | null)?.points_balance ?? 0
  )
  const now = new Date().toISOString()

  await db.from('loyalty_accounts').upsert(
    {
      store_id: storeId,
      customer_phone: phone,
      customer_name:
        (order as { customer_name?: string | null }).customer_name?.trim() ||
        (accountRow as { customer_name?: string } | null)?.customer_name ||
        null,
      points_balance: currentBalance + points,
      lifetime_redeemed: Math.max(
        0,
        Number((accountRow as { lifetime_redeemed?: number } | null)?.lifetime_redeemed ?? 0) -
          points
      ),
      updated_at: now,
    },
    { onConflict: 'store_id,customer_phone' }
  )

  await db.from('loyalty_ledger').insert({
    store_id: storeId,
    customer_phone: phone,
    kind: 'adjust',
    points_delta: points,
    order_id: orderId,
    note: `Estorno resgate — pedido cancelado (+${points} pts)`,
  })
}

/** Dispara crédito de pontos a partir do pedido na base de dados. */
export async function triggerLoyaltyEarnForDeliveredOrder(
  db: SupabaseClient,
  storeId: string,
  orderId: string
): Promise<void> {
  const { data: order } = await db
    .from('orders')
    .select('customer_phone, customer_name, total, created_at, loyalty_points_per_real_snapshot')
    .eq('id', orderId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (!order) return

  const earn = await earnLoyaltyForDeliveredOrder(db, {
    store_id: storeId,
    order_id: orderId,
    customer_phone: (order as { customer_phone?: string | null }).customer_phone,
    customer_name: (order as { customer_name?: string | null }).customer_name,
    order_total: Number((order as { total?: number }).total ?? 0),
    order_created_at: String((order as { created_at?: string }).created_at || ''),
    points_per_real: (order as { loyalty_points_per_real_snapshot?: number | null })
      .loyalty_points_per_real_snapshot,
  })

  if (!earn) return

  await sendLoyaltyDeliveredWhatsAppNotification(db, storeId, earn).catch((e) =>
    console.warn('[loyalty whatsapp notify]', e)
  )
}
