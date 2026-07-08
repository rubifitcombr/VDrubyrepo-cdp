import Link from 'next/link'
import { redirect } from 'next/navigation'
import { GarconsPageClient } from '@/app/dashboard/garcons/_components/GarconsPageClient'
import { getUser } from '@/services/auth.server'
import { loadGarconsPageData } from '@/services/garcons-page.server'
import { getStoreByUser } from '@/services/store.server'

export default async function GarconsPage({
  searchParams,
}: {
  searchParams: Promise<{ hub?: string }>
}) {
  const sp = await searchParams
  if (sp.hub !== 'administracao') {
    redirect('/dashboard/garcons?hub=administracao')
  }

  const user = await getUser()
  if (!user) return null

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center shadow-sm">
        <h1 className="font-brand text-xl font-bold text-vyria-navy">Loja não encontrada</h1>
        <p className="mt-2 text-sm text-vyria-navy-muted">
          Precisas de uma loja associada à tua conta.
        </p>
        <Link
          href="/dashboard/settings?hub=administracao"
          className="btn-vyria-gradient mt-8 inline-flex rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Configurações
        </Link>
      </div>
    )
  }

  const storeId = String((store as { id: unknown }).id)
  const { garcons, missingTable } = await loadGarconsPageData(storeId)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-[#1a1614] sm:text-2xl">
          Meus garçons
        </h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Cadastre a equipe do salão e acompanhe o desempenho no{' '}
          <span className="font-semibold text-[#374151]">Relatório de garçons</span>. O mapa de
          mesas fica em{' '}
          <Link
            href="/dashboard/garcom?hub=salao"
            className="font-semibold text-[var(--dash-primary)] hover:underline"
          >
            Salão / Mesas
          </Link>
          .
        </p>
      </header>
      <GarconsPageClient
        initialGarcons={garcons}
        initialMissingTable={missingTable}
      />
    </div>
  )
}
