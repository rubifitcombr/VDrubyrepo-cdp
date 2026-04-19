import 'server-only'

import type { BillingInvoiceRow, BillingInvoiceStatus } from '@/lib/billing'
import { createClient } from '@/lib/supabase/server'

type FaturaRow = {
  criado_em: string
  descricao: string
  valor: number | string
  status: string
}

function mapDbStatus(s: string): BillingInvoiceStatus | null {
  const t = String(s || '').toLowerCase()
  if (t === 'pago') return 'paid'
  if (t === 'pendente') return 'pending'
  if (t === 'falhou') return 'failed'
  return null
}

/** Faturas registadas manualmente (tabela `faturas`). */
export async function fetchFaturasForStore(
  storeId: string
): Promise<BillingInvoiceRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('faturas')
    .select('criado_em, descricao, valor, status')
    .eq('store_id', storeId)
    .order('criado_em', { ascending: false })
    .limit(50)

  if (error || !data?.length) {
    return []
  }

  const out: BillingInvoiceRow[] = []
  for (const raw of data as FaturaRow[]) {
    const status = mapDbStatus(raw.status)
    if (!status) continue
    const amount =
      typeof raw.valor === 'number'
        ? raw.valor
        : Number(String(raw.valor).replace(',', '.'))
    if (!Number.isFinite(amount)) continue
    const date =
      typeof raw.criado_em === 'string'
        ? raw.criado_em.slice(0, 10)
        : ''
    if (!date) continue
    out.push({
      date,
      description: String(raw.descricao || '').slice(0, 200),
      amount,
      status,
    })
  }
  return out
}
