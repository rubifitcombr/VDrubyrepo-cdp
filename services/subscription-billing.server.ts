import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  effectiveMonthlyRevenueBrl,
  parseBillingCycle,
  readStoreContract,
} from '@/lib/contract-pricing'
import { parsePlan } from '@/lib/plan'
import { parseOperationModeFromStore } from '@/lib/merchant-operation-mode'
import { readStorePlano } from '@/lib/store-columns'
import {
  buildSubscriptionBillingUiState,
  mapInvoiceRow,
} from '@/lib/subscription-billing-gates'
import {
  currentReferenceMonth,
  dueDateForReferenceMonth,
  todayIsoLocal,
} from '@/lib/subscription-billing-copy'
import type {
  SubscriptionBillingUiState,
  SubscriptionInvoiceRow,
} from '@/lib/subscription-billing-types'
import {
  createPixPaymentForInvoice,
  isMpPaymentApproved,
  syncPaymentStatus,
} from '@/services/mercadopago-subscription.server'
import {
  getPlatformBillingConfig,
  isPlatformBillingEnabled,
} from '@/services/platform-billing-config.server'

function isMissingSchemaError(msg: string): boolean {
  return /relation|does not exist|schema cache|42P01|column/i.test(msg)
}

function endOfReferenceMonthIso(referenceMonth: string): string {
  const [y, m] = referenceMonth.split('-').map(Number)
  const lastDay = new Date(y!, m!, 0).getDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

export function computeSubscriptionAmountBrl(store: Record<string, unknown>): number {
  const plan = parsePlan(readStorePlano(store))
  const operationMode = parseOperationModeFromStore(store)
  const contract = readStoreContract(store)
  return effectiveMonthlyRevenueBrl(plan, operationMode, contract)
}

export async function fetchSubscriptionInvoiceById(
  svc: SupabaseClient,
  invoiceId: string
): Promise<SubscriptionInvoiceRow | null> {
  const { data, error } = await svc
    .from('subscription_invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle()

  if (error) {
    if (isMissingSchemaError(error.message)) return null
    throw new Error(error.message)
  }
  return data ? mapInvoiceRow(data as Record<string, unknown>) : null
}

export async function fetchOpenSubscriptionInvoice(
  svc: SupabaseClient,
  storeId: string,
  referenceMonth?: string
): Promise<SubscriptionInvoiceRow | null> {
  let query = svc
    .from('subscription_invoices')
    .select('*')
    .eq('store_id', storeId)
    .eq('status', 'pending')

  if (referenceMonth) {
    query = query.eq('reference_month', referenceMonth)
  }

  const { data, error } = await query
    .order('reference_month', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMissingSchemaError(error.message)) return null
    throw new Error(error.message)
  }
  if (!data) return null
  return mapInvoiceRow(data as Record<string, unknown>)
}

export async function fetchSubscriptionInvoicesForStore(
  svc: SupabaseClient,
  storeId: string,
  limit = 24
): Promise<SubscriptionInvoiceRow[]> {
  const { data, error } = await svc
    .from('subscription_invoices')
    .select('*')
    .eq('store_id', storeId)
    .order('reference_month', { ascending: false })
    .limit(limit)

  if (error) {
    if (isMissingSchemaError(error.message)) return []
    throw new Error(error.message)
  }
  return (data ?? []).map((r) => mapInvoiceRow(r as Record<string, unknown>))
}

async function syncStoreBillingFields(
  svc: SupabaseClient,
  storeId: string,
  invoice: SubscriptionInvoiceRow | null
): Promise<void> {
  const now = new Date().toISOString()
  if (!invoice || invoice.status === 'paid' || invoice.status === 'waived') {
    await svc
      .from('stores')
      .update({
        billing_subscription_status: 'active',
        billing_overdue_at: null,
        billing_open_invoice_at: null,
        billing_invoice_pay_url: null,
      })
      .eq('id', storeId)
    return
  }

  if (invoice.status === 'pending') {
    const patch: Record<string, unknown> = {
      billing_subscription_status: 'overdue',
      billing_open_invoice_at: invoice.issued_at,
      billing_invoice_pay_url: '/dashboard/assinatura',
    }
    const asOf = todayIsoLocal()
    if (asOf > invoice.due_date) {
      patch.billing_overdue_at = `${invoice.due_date}T12:00:00.000Z`
    }
    await svc.from('stores').update(patch).eq('id', storeId)
  }
}

export async function markSubscriptionInvoicePaid(
  svc: SupabaseClient,
  invoiceId: string,
  mpPaymentId: string
): Promise<SubscriptionInvoiceRow | null> {
  const invoice = await fetchSubscriptionInvoiceById(svc, invoiceId)
  if (!invoice) return null
  if (invoice.status === 'paid') return invoice

  const paidAt = new Date().toISOString()
  const planoVence = endOfReferenceMonthIso(invoice.reference_month)

  const { error: invErr } = await svc
    .from('subscription_invoices')
    .update({
      status: 'paid',
      paid_at: paidAt,
      mp_payment_id: mpPaymentId,
      updated_at: paidAt,
    })
    .eq('id', invoiceId)
    .eq('status', 'pending')

  if (invErr) throw new Error(invErr.message)

  await svc
    .from('stores')
    .update({
      billing_subscription_status: 'active',
      billing_overdue_at: null,
      billing_open_invoice_at: null,
      billing_invoice_pay_url: null,
      plano_vence_em: planoVence,
      plano_atualizado_em: paidAt,
    })
    .eq('id', invoice.store_id)

  return { ...invoice, status: 'paid', paid_at: paidAt, mp_payment_id: mpPaymentId }
}

export async function ensurePixForInvoice(
  svc: SupabaseClient,
  invoice: SubscriptionInvoiceRow,
  payerEmail: string
): Promise<SubscriptionInvoiceRow> {
  if (invoice.mp_payment_id && invoice.pix_copy_paste) {
    return invoice
  }

  const pix = await createPixPaymentForInvoice(svc, { invoice, payerEmail })
  const updatedAt = new Date().toISOString()

  const { data, error } = await svc
    .from('subscription_invoices')
    .update({
      mp_payment_id: pix.paymentId,
      pix_qr_code: pix.pixQrCode,
      pix_qr_base64: pix.pixQrBase64,
      pix_copy_paste: pix.pixCopyPaste,
      updated_at: updatedAt,
    })
    .eq('id', invoice.id)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapInvoiceRow(data as Record<string, unknown>)
}

export async function reconcileInvoiceWithMp(
  svc: SupabaseClient,
  invoice: SubscriptionInvoiceRow
): Promise<SubscriptionInvoiceRow> {
  if (!invoice.mp_payment_id || invoice.status !== 'pending') return invoice

  const mp = await syncPaymentStatus(svc, invoice.mp_payment_id)
  if (isMpPaymentApproved(mp.status)) {
    const paid = await markSubscriptionInvoicePaid(svc, invoice.id, invoice.mp_payment_id)
    return paid ?? invoice
  }
  return invoice
}

export async function getSubscriptionBillingUiForStore(
  svc: SupabaseClient,
  storeId: string,
  payerEmail?: string
): Promise<SubscriptionBillingUiState | null> {
  const config = await getPlatformBillingConfig(svc)
  if (!isPlatformBillingEnabled(config)) return null

  let invoice = await fetchOpenSubscriptionInvoice(svc, storeId)
  if (!invoice) return buildSubscriptionBillingUiState(null)

  if (!invoice.pix_copy_paste && payerEmail) {
    try {
      invoice = await ensurePixForInvoice(svc, invoice, payerEmail)
    } catch (e) {
      console.warn('[subscription-billing] ensurePixForInvoice', e)
    }
  }

  return buildSubscriptionBillingUiState(invoice)
}

export async function createMonthlyInvoiceForStore(
  svc: SupabaseClient,
  store: Record<string, unknown>,
  referenceMonth: string,
  payerEmail: string
): Promise<SubscriptionInvoiceRow | null> {
  const storeId = String(store.id ?? '')
  if (!storeId) return null

  const { data: existing } = await svc
    .from('subscription_invoices')
    .select('id')
    .eq('store_id', storeId)
    .eq('reference_month', referenceMonth)
    .maybeSingle()

  if (existing) return null

  const plan = parsePlan(readStorePlano(store))
  const billingCycle = parseBillingCycle(store.billing_cycle)
  const amount = computeSubscriptionAmountBrl(store)
  const dueDate = dueDateForReferenceMonth(referenceMonth)
  const issuedAt = new Date().toISOString()

  const { data, error } = await svc
    .from('subscription_invoices')
    .insert({
      store_id: storeId,
      reference_month: referenceMonth,
      amount_brl: amount,
      billing_cycle: billingCycle,
      plan: plan.toLowerCase(),
      status: 'pending',
      issued_at: issuedAt,
      due_date: dueDate,
    })
    .select('*')
    .single()

  if (error) {
    if (/duplicate|unique/i.test(error.message)) return null
    throw new Error(error.message)
  }

  let invoice = mapInvoiceRow(data as Record<string, unknown>)
  await syncStoreBillingFields(svc, storeId, invoice)

  try {
    invoice = await ensurePixForInvoice(svc, invoice, payerEmail)
  } catch (e) {
    console.warn('[subscription-billing] PIX on emit', storeId, e)
  }

  return invoice
}

export type EmitMonthlyInvoicesResult = {
  referenceMonth: string
  created: number
  skipped: number
  errors: string[]
}

export async function emitMonthlyInvoicesJob(
  asOf: string = todayIsoLocal()
): Promise<EmitMonthlyInvoicesResult> {
  const { createServiceRoleClient } = await import('@/lib/supabase/service-role.server')
  const db = createServiceRoleClient()

  const config = await getPlatformBillingConfig(db)
  if (!isPlatformBillingEnabled(config)) {
    return {
      referenceMonth: currentReferenceMonth(asOf),
      created: 0,
      skipped: 0,
      errors: ['Cobrança PIX desativada ou sem token Mercado Pago'],
    }
  }

  const referenceMonth = currentReferenceMonth(asOf)
  const day = Number(asOf.slice(8, 10))
  if (day !== 1) {
    return {
      referenceMonth,
      created: 0,
      skipped: 0,
      errors: [`Ignorado: emitir só no dia 1 (hoje=${day})`],
    }
  }

  const { data: stores, error } = await db
    .from('stores')
    .select(
      'id, owner_id, status, merchant_status, plano, plan, billing_cycle, contrato_mensal_brl, operation_mode'
    )
    .eq('status', 'ativo')

  if (error) throw new Error(error.message)

  let created = 0
  let skipped = 0
  const errors: string[] = []

  for (const raw of stores ?? []) {
    const store = raw as Record<string, unknown>
    const storeId = String(store.id ?? '')
    try {
      const ownerId = String(store.owner_id ?? '')
      let payerEmail = 'lojista@vyria.local'
      if (ownerId) {
        const { data: userData } = await db.auth.admin.getUserById(ownerId)
        if (userData?.user?.email) payerEmail = userData.user.email
      }

      const invoice = await createMonthlyInvoiceForStore(db, store, referenceMonth, payerEmail)
      if (invoice) created += 1
      else skipped += 1
    } catch (e) {
      errors.push(`${storeId}: ${e instanceof Error ? e.message : 'erro'}`)
    }
  }

  return { referenceMonth, created, skipped, errors }
}

export type SyncMonthlyInvoicesResult = {
  synced: number
  paid: number
  errors: string[]
}

export async function syncMonthlyInvoicesJob(): Promise<SyncMonthlyInvoicesResult> {
  const { createServiceRoleClient } = await import('@/lib/supabase/service-role.server')
  const db = createServiceRoleClient()

  const config = await getPlatformBillingConfig(db)
  if (!isPlatformBillingEnabled(config)) {
    return { synced: 0, paid: 0, errors: ['Cobrança PIX desativada'] }
  }

  const { data, error } = await db
    .from('subscription_invoices')
    .select('*')
    .eq('status', 'pending')
    .not('mp_payment_id', 'is', null)
    .limit(500)

  if (error) throw new Error(error.message)

  let synced = 0
  let paid = 0
  const errors: string[] = []

  for (const raw of data ?? []) {
    const invoice = mapInvoiceRow(raw as Record<string, unknown>)
    try {
      const before = invoice.status
      const after = await reconcileInvoiceWithMp(db, invoice)
      synced += 1
      if (before === 'pending' && after.status === 'paid') paid += 1
      await syncStoreBillingFields(db, after.store_id, after.status === 'pending' ? after : null)
    } catch (e) {
      errors.push(`${invoice.id}: ${e instanceof Error ? e.message : 'erro'}`)
    }
  }

  const asOf = todayIsoLocal()
  const { data: pendingAll } = await db
    .from('subscription_invoices')
    .select('*')
    .eq('status', 'pending')

  for (const raw of pendingAll ?? []) {
    const invoice = mapInvoiceRow(raw as Record<string, unknown>)
    await syncStoreBillingFields(db, invoice.store_id, invoice)
    if (asOf > invoice.due_date) {
      // overdue — store fields already updated
    }
  }

  return { synced, paid, errors }
}

export async function handleMercadoPagoPaymentWebhook(
  svc: SupabaseClient,
  mpPaymentId: string
): Promise<boolean> {
  const mp = await syncPaymentStatus(svc, mpPaymentId)
  if (!isMpPaymentApproved(mp.status)) return false

  let invoiceId: string | null = null

  const { data: byMp } = await svc
    .from('subscription_invoices')
    .select('id')
    .eq('mp_payment_id', mpPaymentId)
    .maybeSingle()

  if (byMp && typeof (byMp as { id?: string }).id === 'string') {
    invoiceId = (byMp as { id: string }).id
  }

  if (!invoiceId) {
    const config = await getPlatformBillingConfig(svc)
    const accessToken = (await import('@/services/platform-billing-config.server')).resolveMercadoPagoAccessToken(config)
    if (accessToken) {
      const resp = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(mpPaymentId)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        }
      )
      const body = (await resp.json().catch(() => ({}))) as {
        external_reference?: string
      }
      const ref = body.external_reference?.trim()
      if (ref) invoiceId = ref
    }
  }

  if (!invoiceId) return false

  const paid = await markSubscriptionInvoicePaid(svc, invoiceId, mpPaymentId)
  return !!paid
}
