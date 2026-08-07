import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrCreateLoyaltyConfig } from '@/lib/loyalty-config'
import type { LoyaltyDeliveredEarnResult, StoreLoyaltyConfig } from '@/lib/loyalty/types'
import { calculateEarnPoints } from '@/lib/loyalty/utils'
import { isPostgresUniqueViolation } from '@/lib/postgres-errors'

export function normalizePhoneE164(raw: string): string {
  return raw.replace(/\D/g, '')
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
    const { data: ledgerRow, error: ledgerErr } = await db
      .from('loyalty_ledger')
      .insert({
        store_id: input.store_id,
        customer_phone: phone,
        kind: 'earn',
        points_delta: points,
        order_id: input.order_id,
        note: 'Pedido entregue',
      })
      .select('id')
      .maybeSingle()

    if (ledgerErr) {
      if (isPostgresUniqueViolation(ledgerErr)) {
        return null
      }
      throw new Error(ledgerErr.message || 'Erro ao creditar pontos.')
    }

    if (!ledgerRow?.id) {
      return null
    }

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
