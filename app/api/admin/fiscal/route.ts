import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/admin-auth.server'
import { parseFiscalCertStatus, parseFiscalStatus } from '@/lib/fiscal'
import { getFiscalReadinessForStore } from '@/services/fiscal-readiness.server'

export async function GET() {
  const ctx = await requireAdminApi()
  if (!ctx.ok) return ctx.response

  const { data, error } = await ctx.svc
    .from('store_fiscal_config')
    .select(
      'store_id, status, ambiente, cnpj, razao_social, cert_status, cert_validade, brasilnfe_token, csc_id, csc_token, updated_at, stores(name, slug)'
    )
    .order('updated_at', { ascending: false })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const items = await Promise.all(
    (data ?? []).map(async (row) => {
      const r = row as Record<string, unknown>
      const store = (r.stores ?? {}) as Record<string, unknown>
      const storeId = String(r.store_id ?? '')
      const readiness = await getFiscalReadinessForStore(ctx.svc, storeId)
      return {
        storeId,
        storeName: (store.name as string | null) ?? '—',
        slug: (store.slug as string | null) ?? null,
        status: parseFiscalStatus(r.status),
        ambiente: String(r.ambiente ?? 'homologacao'),
        cnpj: (r.cnpj as string | null) ?? '',
        razaoSocial: (r.razao_social as string | null) ?? '',
        certStatus: parseFiscalCertStatus(r.cert_status),
        certValidade: (r.cert_validade as string | null) ?? '',
        hasToken: Boolean(r.brasilnfe_token),
        hasCsc: Boolean((r.csc_id as string | null)?.trim() && (r.csc_token as string | null)?.trim()),
        readinessReady: readiness.ready,
        readinessPending: readiness.pendingCount,
      }
    })
  )

  return NextResponse.json({ ok: true, items })
}
