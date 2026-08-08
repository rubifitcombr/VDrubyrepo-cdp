import { test, expect } from './test-with-teardown'
import { execSync } from 'child_process'
import path from 'path'
import { REFERRAL_POINTS_TO_REDEEM } from '../../lib/referral/constants'
import {
  countOkResponses,
  E2E_STORE_ID,
  getSupabaseAdmin,
  readE2eTestData,
} from './helpers'
import { trackReferralRedeemForTeardown, trackReferralRedemptionForTeardown } from './teardown'

test.describe('Grupo B #4 — referral redeem', () => {
  test.beforeAll(() => {
    const script = path.resolve(process.cwd(), 'scripts/apply-concurrency-migration.mjs')
    try {
      execSync(`node "${script}"`, { stdio: 'pipe', env: process.env })
    } catch (e) {
      console.warn('[migration]', e)
    }
  })

  test('duas requisições concorrentes: só um resgate debita pontos', async ({ request }) => {
    const sb = getSupabaseAdmin()
    readE2eTestData()

    const { data: accountBefore } = await sb
      .from('store_referral_accounts')
      .select('referral_code, points_balance')
      .eq('store_id', E2E_STORE_ID)
      .maybeSingle()

    const previousBalance = Number(
      (accountBefore as { points_balance?: number } | null)?.points_balance ?? 0
    )
    const referralCode =
      (accountBefore as { referral_code?: string } | null)?.referral_code ??
      `E2E${Date.now().toString().slice(-6)}`

    if (!accountBefore) {
      await sb.from('store_referral_accounts').insert({
        store_id: E2E_STORE_ID,
        referral_code: referralCode,
        points_balance: 0,
      })
    }

    const expiresAt = new Date()
    expiresAt.setUTCDate(expiresAt.getUTCDate() + 30)

    const { data: ledgerRow, error: ledgerInsErr } = await sb
      .from('store_referral_ledger')
      .insert({
        store_id: E2E_STORE_ID,
        delta: REFERRAL_POINTS_TO_REDEEM,
        reason: 'manual_adjust',
        expires_at: expiresAt.toISOString(),
      })
      .select('id')
      .single()

    expect(ledgerInsErr).toBeNull()
    expect(ledgerRow?.id).toBeTruthy()
    trackReferralRedeemForTeardown({
      ledgerId: ledgerRow!.id,
      restoreBalance: previousBalance,
    })

    const { error: balanceErr } = await sb
      .from('store_referral_accounts')
      .update({ points_balance: REFERRAL_POINTS_TO_REDEEM })
      .eq('store_id', E2E_STORE_ID)

    expect(balanceErr).toBeNull()

    const { data: before } = await sb
      .from('store_referral_accounts')
      .select('points_balance')
      .eq('store_id', E2E_STORE_ID)
      .single()

    expect(Number(before?.points_balance ?? 0)).toBeGreaterThanOrEqual(REFERRAL_POINTS_TO_REDEEM)

    const redemptionsBefore = await sb
      .from('store_referral_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', E2E_STORE_ID)

    const [r1, r2] = await Promise.all([
      request.post('/api/referrals/redeem'),
      request.post('/api/referrals/redeem'),
    ])

    if (countOkResponses([r1, r2]) !== 1) {
      const bodies = await Promise.all([r1.text(), r2.text()])
      throw new Error(
        `Esperado 1 sucesso; status ${r1.status()}/${r2.status()}: ${bodies[0]} | ${bodies[1]}`
      )
    }

    const loser = r1.ok() ? r2 : r1
    expect(loser.ok()).toBe(false)
    expect([400, 409]).toContain(loser.status())

    const { count: redemptionCount } = await sb
      .from('store_referral_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', E2E_STORE_ID)

    expect(redemptionCount).toBe((redemptionsBefore.count ?? 0) + 1)

    const { data: after } = await sb
      .from('store_referral_accounts')
      .select('points_balance')
      .eq('store_id', E2E_STORE_ID)
      .single()

    expect(Number(after?.points_balance ?? 0)).toBe(
      Number(before?.points_balance ?? 0) - REFERRAL_POINTS_TO_REDEEM
    )

    const { data: redemptionRows } = await sb
      .from('store_referral_redemptions')
      .select('id')
      .eq('store_id', E2E_STORE_ID)
      .order('created_at', { ascending: false })
      .limit(1)

    const redemptionId = redemptionRows?.[0]?.id
    if (redemptionId) {
      trackReferralRedemptionForTeardown(redemptionId)
      await sb.from('store_referral_ledger').delete().eq('redemption_id', redemptionId)
      await sb.from('store_referral_redemptions').delete().eq('id', redemptionId)
    }

    await sb.from('store_referral_ledger').delete().eq('id', ledgerRow!.id)
    await sb
      .from('store_referral_accounts')
      .update({ points_balance: previousBalance })
      .eq('store_id', E2E_STORE_ID)
  })
})
