import Link from 'next/link'
import { MarketingClient } from './_components/MarketingClient'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import {
  getMarketingCampaignsForStore,
  getMarketingConnectionForStore,
} from '@/services/marketing.server'

function cityFromAddress(address: unknown): string {
  const raw = typeof address === 'string' ? address.trim() : ''
  if (!raw) return ''
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean)
  return parts.at(-1) ?? ''
}

export default async function MarketingPage() {
  const user = await getUser()
  if (!user) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">
          Sessão necessária
        </h1>
        <Link
          href="/login"
          className="btn-vyria-gradient mt-8 inline-flex rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Ir para login
        </Link>
      </div>
    )
  }

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">
          Loja não encontrada
        </h1>
        <p className="mt-2 text-sm text-vyria-navy-muted">
          Precisas de uma loja associada à tua conta.
        </p>
      </div>
    )
  }

  const row = store as Record<string, unknown>
  const storeId = String(row.id)
  const [connection, campaigns] = await Promise.all([
    getMarketingConnectionForStore(storeId),
    getMarketingCampaignsForStore(storeId),
  ])
  const publicBase = process.env.VYRIA_PUBLIC_URL?.replace(/\/$/, '') || ''
  const slug = typeof row.slug === 'string' ? row.slug : ''

  return (
    <MarketingClient
      connection={connection}
      initialCampaigns={campaigns}
      storeName={String(row.name || 'Loja')}
      storeCity={cityFromAddress(row.address)}
      storePhone={typeof row.phone === 'string' ? row.phone : ''}
      publicMenuUrl={publicBase && slug ? `${publicBase}/${slug}` : ''}
    />
  )
}
