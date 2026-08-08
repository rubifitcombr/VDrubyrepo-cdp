import { E2E_STORE_ID, getSupabaseAdmin } from './helpers'

const trackedOrderIds = new Set<string>()
const trackedEntregaIds = new Set<string>()
const trackedCaixaMovimentacaoIds = new Set<string>()
const trackedProductStockClears = new Set<string>()
const trackedLoyaltyOrderIds = new Set<string>()
const trackedLoyaltyPhones = new Set<string>()
const trackedReferralLedgerIds = new Set<string>()
const trackedReferralRedemptionIds = new Set<string>()
const trackedReferralIds = new Set<string>()
const trackedReferredStoreIds = new Set<string>()
let referralBalanceRestore: { storeId: string; balance: number } | null = null

export function trackOrderForTeardown(orderId: string | null | undefined): void {
  if (orderId) trackedOrderIds.add(orderId)
}

export function trackEntregaForTeardown(entregaId: string | null | undefined): void {
  if (entregaId) trackedEntregaIds.add(entregaId)
}

export function trackCaixaMovimentacaoForTeardown(
  movimentacaoId: string | null | undefined
): void {
  if (movimentacaoId) trackedCaixaMovimentacaoIds.add(movimentacaoId)
}

export function trackProductStockClearOnTeardown(productId: string | null | undefined): void {
  if (productId) trackedProductStockClears.add(productId)
}

export function trackLoyaltyTestForTeardown(
  orderId: string,
  customerPhone: string
): void {
  trackedLoyaltyOrderIds.add(orderId)
  trackedLoyaltyPhones.add(customerPhone)
}

export function trackReferralActivationForTeardown(input: {
  referredStoreId: string
  referralId: string
  restoreBalance: number
}): void {
  trackedReferredStoreIds.add(input.referredStoreId)
  trackedReferralIds.add(input.referralId)
  referralBalanceRestore = {
    storeId: E2E_STORE_ID,
    balance: input.restoreBalance,
  }
}

export function trackReferralRedeemForTeardown(input: {
  ledgerId: string
  restoreBalance: number
}): void {
  trackedReferralLedgerIds.add(input.ledgerId)
  referralBalanceRestore = {
    storeId: E2E_STORE_ID,
    balance: input.restoreBalance,
  }
}

export function trackReferralRedemptionForTeardown(
  redemptionId: string | null | undefined
): void {
  if (redemptionId) trackedReferralRedemptionIds.add(redemptionId)
}

async function restoreOrderStock(
  sb: ReturnType<typeof getSupabaseAdmin>,
  orderId: string
): Promise<void> {
  const { data: items } = await sb
    .from('order_items')
    .select('product_id, quantity')
    .eq('order_id', orderId)

  for (const line of items ?? []) {
    if (!line.product_id || Number(line.quantity) <= 0) continue
    const productId = String(line.product_id)
    const qty = Math.max(0, Number(line.quantity) || 0)
    const { data: row } = await sb
      .from('store_product_stock')
      .select('quantity')
      .eq('store_id', E2E_STORE_ID)
      .eq('product_id', productId)
      .maybeSingle()
    if (!row) continue
    const next = (Number(row.quantity) || 0) + qty
    await sb
      .from('store_product_stock')
      .update({ quantity: next, updated_at: new Date().toISOString() })
      .eq('store_id', E2E_STORE_ID)
      .eq('product_id', productId)
  }
}

async function purgeOrder(
  sb: ReturnType<typeof getSupabaseAdmin>,
  orderId: string
): Promise<void> {
  await restoreOrderStock(sb, orderId)
  await sb.from('order_items').delete().eq('order_id', orderId)

  const { data: deleted } = await sb
    .from('orders')
    .delete()
    .eq('id', orderId)
    .eq('store_id', E2E_STORE_ID)
    .select('id')

  if ((deleted ?? []).length > 0) return

  const { data: row } = await sb
    .from('orders')
    .select('notes, status')
    .eq('id', orderId)
    .eq('store_id', E2E_STORE_ID)
    .maybeSingle()

  if (!row || String(row.status).toLowerCase() === 'cancelled') return

  const noteBase = String(row.notes ?? '').trim()
  const line = '[E2E teardown] Comanda de teste cancelada.'
  const notes = noteBase ? `${noteBase}\n${line}` : line
  await sb
    .from('orders')
    .update({ status: 'cancelled', notes })
    .eq('id', orderId)
    .eq('store_id', E2E_STORE_ID)
}

export async function runConcurrencyTeardown(): Promise<void> {
  const sb = getSupabaseAdmin()

  for (const movId of trackedCaixaMovimentacaoIds) {
    await sb.from('caixa_movimentacoes').delete().eq('id', movId)
  }
  trackedCaixaMovimentacaoIds.clear()

  for (const entregaId of trackedEntregaIds) {
    await sb.from('entregas').delete().eq('id', entregaId)
  }
  trackedEntregaIds.clear()

  for (const orderId of trackedLoyaltyOrderIds) {
    await sb.from('loyalty_ledger').delete().eq('order_id', orderId)
  }
  for (const phone of trackedLoyaltyPhones) {
    await sb
      .from('loyalty_accounts')
      .delete()
      .eq('store_id', E2E_STORE_ID)
      .eq('customer_phone', phone)
  }
  trackedLoyaltyOrderIds.clear()
  trackedLoyaltyPhones.clear()

  for (const redemptionId of trackedReferralRedemptionIds) {
    await sb.from('store_referral_ledger').delete().eq('redemption_id', redemptionId)
    await sb.from('store_referral_redemptions').delete().eq('id', redemptionId)
  }
  trackedReferralRedemptionIds.clear()

  for (const ledgerId of trackedReferralLedgerIds) {
    await sb.from('store_referral_ledger').delete().eq('id', ledgerId)
  }
  trackedReferralLedgerIds.clear()

  for (const referralId of trackedReferralIds) {
    await sb.from('store_referral_ledger').delete().eq('referral_id', referralId)
    await sb.from('store_referrals').delete().eq('id', referralId)
  }
  trackedReferralIds.clear()

  for (const storeId of trackedReferredStoreIds) {
    await sb.from('stores').delete().eq('id', storeId)
  }
  trackedReferredStoreIds.clear()

  if (referralBalanceRestore) {
    await sb
      .from('store_referral_accounts')
      .update({ points_balance: referralBalanceRestore.balance })
      .eq('store_id', referralBalanceRestore.storeId)
    referralBalanceRestore = null
  }

  for (const orderId of trackedOrderIds) {
    await purgeOrder(sb, orderId)
  }
  trackedOrderIds.clear()

  for (const productId of trackedProductStockClears) {
    await sb
      .from('store_product_stock')
      .delete()
      .eq('store_id', E2E_STORE_ID)
      .eq('product_id', productId)
  }
  trackedProductStockClears.clear()
}
