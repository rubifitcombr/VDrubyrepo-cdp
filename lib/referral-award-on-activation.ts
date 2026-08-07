import type { SupabaseClient } from '@supabase/supabase-js'
import {
  REFERRAL_POINTS_PER_ACTIVATION,
  REFERRAL_POINTS_VALIDITY_DAYS,
} from '@/lib/referral/constants'
import { isPostgresUniqueViolation } from '@/lib/postgres-errors'
import { getOrCreateReferralAccount } from '@/lib/store-referral-account'

export async function awardReferralOnStoreActivation(
  svc: SupabaseClient,
  activatedStoreId: string
): Promise<void> {
  const { data: store, error: stErr } = await svc
    .from('stores')
    .select('id, referred_by_store_id, name')
    .eq('id', activatedStoreId)
    .maybeSingle()

  if (stErr || !store) return
  const referrerId = String(
    (store as { referred_by_store_id?: string }).referred_by_store_id ?? ''
  ).trim()
  if (!referrerId) return

  const { data: referral, error: refErr } = await svc
    .from('store_referrals')
    .select('id, status, referral_code')
    .eq('referred_store_id', activatedStoreId)
    .eq('referrer_store_id', referrerId)
    .maybeSingle()

  if (refErr || !referral?.id) return
  if (String(referral.status) === 'activated') return

  const now = new Date().toISOString()
  const expiresAt = new Date()
  expiresAt.setUTCDate(expiresAt.getUTCDate() + REFERRAL_POINTS_VALIDITY_DAYS)

  const { data: activatedRows, error: upRef } = await svc
    .from('store_referrals')
    .update({ status: 'activated', activated_at: now })
    .eq('id', referral.id)
    .eq('status', 'pending')
    .select('id')

  if (upRef) {
    console.warn('[referral] activate row:', upRef.message)
    return
  }

  if (!activatedRows?.length) {
    return
  }

  await getOrCreateReferralAccount(svc, referrerId)

  const { error: ledErr } = await svc.from('store_referral_ledger').insert({
    store_id: referrerId,
    delta: REFERRAL_POINTS_PER_ACTIVATION,
    reason: 'referral_activated',
    referral_id: referral.id,
    expires_at: expiresAt.toISOString(),
  })

  if (ledErr) {
    if (isPostgresUniqueViolation(ledErr)) {
      return
    }
    console.warn('[referral] ledger earn:', ledErr.message)
    return
  }

  const { data: accountRow } = await svc
    .from('store_referral_accounts')
    .select('points_balance')
    .eq('store_id', referrerId)
    .maybeSingle()

  const currentBalance = Number(
    (accountRow as { points_balance?: number } | null)?.points_balance ?? 0
  )
  const { error: balErr } = await svc
    .from('store_referral_accounts')
    .update({ points_balance: currentBalance + REFERRAL_POINTS_PER_ACTIVATION })
    .eq('store_id', referrerId)

  if (balErr) {
    console.warn('[referral] points_balance increment:', balErr.message)
  }
}
