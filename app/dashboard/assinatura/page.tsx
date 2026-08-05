import Link from 'next/link'
import { AssinaturaClient } from '@/app/dashboard/assinatura/assinatura-client'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import type { BillingInvoiceRow } from '@/lib/billing'
import { readStorePlano } from '@/lib/store-columns'
import { tryCreateServiceRoleClient } from '@/lib/supabase/service-role.server'
import { getAssinaturaPageModel } from '@/services/billing.server'
import { fetchFaturasForStore } from '@/services/faturas.server'
import {
  fetchSubscriptionInvoicesForStore,
  getSubscriptionBillingUiForStore,
} from '@/services/subscription-billing.server'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'

function mapSubscriptionInvoices(
  rows: Awaited<ReturnType<typeof fetchSubscriptionInvoicesForStore>>
): BillingInvoiceRow[] {
  return rows.map((inv) => ({
    date: inv.due_date,
    description: `Mensalidade Vyria (${inv.reference_month})`,
    amount: inv.amount_brl,
    status:
      inv.status === 'paid'
        ? 'paid'
        : inv.status === 'failed'
          ? 'failed'
          : 'pending',
  }))
}

export default async function AssinaturaPage() {
  const user = await getUser()
  if (!user) return null

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object') {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">
          Loja não encontrada
        </h1>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-[var(--dash-primary)]">
          Voltar ao painel
        </Link>
      </div>
    )
  }

  const row = store as Record<string, unknown>
  const rawPlan = readStorePlano(row)
  const plan = effectiveDashboardPlan(user.email ?? null, rawPlan)
  const storeId = String(row.id)
  const billingDb = tryCreateServiceRoleClient()
  const invoices = await fetchFaturasForStore(storeId)
  const subscriptionRows = billingDb
    ? await fetchSubscriptionInvoicesForStore(billingDb, storeId)
    : []
  const mergedInvoices = [...mapSubscriptionInvoices(subscriptionRows), ...invoices].sort(
    (a, b) => b.date.localeCompare(a.date)
  )
  const model = await getAssinaturaPageModel(row, plan, mergedInvoices)
  const subscriptionBilling = billingDb
    ? await getSubscriptionBillingUiForStore(billingDb, storeId, user.email ?? undefined)
    : null

  return <AssinaturaClient model={model} subscriptionBilling={subscriptionBilling} />
}
