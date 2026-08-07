import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import path from 'path'
import { awardReferralOnStoreActivation } from '@/lib/referral-award-on-activation'
import { REFERRAL_POINTS_PER_ACTIVATION } from '../../lib/referral/constants'
import { E2E_STORE_ID, getSupabaseAdmin } from './helpers'

test.describe('Grupo B #3 — referral activation', () => {
  test.beforeAll(() => {
    const script = path.resolve(process.cwd(), 'scripts/apply-concurrency-migration.mjs')
    try {
      execSync(`node "${script}"`, { stdio: 'pipe', env: process.env })
    } catch (e) {
      console.warn('[migration]', e)
    }
  })

  test('duas activações concorrentes: só um crédito de pontos', async () => {
    const sb = getSupabaseAdmin()
    const referredStoreId = crypto.randomUUID()
    const referrerStoreId = E2E_STORE_ID

    const { data: referrerRow } = await sb
      .from('stores')
      .select('owner_id')
      .eq('id', referrerStoreId)
      .single()

    const { data: account } = await sb
      .from('store_referral_accounts')
      .select('referral_code')
      .eq('store_id', referrerStoreId)
      .maybeSingle()

    const referralCode = account?.referral_code ?? 'TUDIBOM01'

    const { error: storeErr } = await sb.from('stores').insert({
      id: referredStoreId,
      name: 'E2E Referral Concurrency',
      slug: `e2e-ref-${referredStoreId.slice(0, 8)}`,
      owner_id: referrerRow!.owner_id,
      referred_by_store_id: referrerStoreId,
      status: 'ativo',
      plano: 'growth',
    })
    expect(storeErr).toBeNull()

    const { data: referral, error: refInsErr } = await sb
      .from('store_referrals')
      .insert({
        referrer_store_id: referrerStoreId,
        referred_store_id: referredStoreId,
        referral_code: String(referralCode),
        status: 'pending',
      })
      .select('id')
      .single()

    expect(refInsErr).toBeNull()
    expect(referral?.id).toBeTruthy()

    const { data: balanceBefore } = await sb
      .from('store_referral_accounts')
      .select('points_balance')
      .eq('store_id', referrerStoreId)
      .maybeSingle()

    const ptsBefore = Number(balanceBefore?.points_balance ?? 0)

    await Promise.all([
      awardReferralOnStoreActivation(sb, referredStoreId),
      awardReferralOnStoreActivation(sb, referredStoreId),
    ])

    const { count: ledgerCount } = await sb
      .from('store_referral_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', referrerStoreId)
      .eq('referral_id', referral!.id)
      .eq('reason', 'referral_activated')

    const { data: balanceAfter } = await sb
      .from('store_referral_accounts')
      .select('points_balance')
      .eq('store_id', referrerStoreId)
      .maybeSingle()

    expect(ledgerCount).toBe(1)
    expect(Number(balanceAfter?.points_balance ?? 0)).toBe(
      ptsBefore + REFERRAL_POINTS_PER_ACTIVATION
    )

    await sb.from('store_referral_ledger').delete().eq('referral_id', referral!.id)
    await sb.from('store_referrals').delete().eq('id', referral!.id)
    await sb.from('stores').delete().eq('id', referredStoreId)
    await sb
      .from('store_referral_accounts')
      .update({ points_balance: ptsBefore })
      .eq('store_id', referrerStoreId)
  })
})
