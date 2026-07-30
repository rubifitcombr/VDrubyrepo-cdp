import Link from 'next/link'
import { redirect } from 'next/navigation'
import { effectiveDashboardPlan } from '@/lib/effective-plan.server'
import { hasFeature } from '@/lib/plan'
import { readStorePlano } from '@/lib/store-columns'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'

const MODULES = [
  {
    href: '/dashboard/master/whatsapp',
    title: 'WhatsApp & IA',
    description:
      'Ligue o número da loja, configure o webhook Meta e active o robô de atendimento.',
    feature: 'whatsapp_ai' as const,
    ready: true,
  },
  {
    href: '/dashboard/master/fidelidade',
    title: 'Fidelidade & cashback',
    description: 'Pontos por pedido, consulta pelo WhatsApp e resgate no checkout.',
    feature: 'loyalty' as const,
    ready: true,
  },
  {
    href: '/dashboard/master/recuperador',
    title: 'Recuperador de clientes',
    description: 'Campanhas para clientes inativos com relatório de conversão.',
    feature: 'recovery' as const,
    ready: true,
  },
]

export default async function MasterHubPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const store = await getStoreByUser(user.id)
  if (!store || typeof store !== 'object' || !('id' in store)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-10 text-center">
        <p className="text-sm text-vyria-navy-muted">Loja não encontrada.</p>
      </div>
    )
  }

  const plan = effectiveDashboardPlan(user.email, readStorePlano(store as Record<string, unknown>))
  const isMaster =
    hasFeature(plan, 'whatsapp_ai') ||
    hasFeature(plan, 'loyalty') ||
    hasFeature(plan, 'recovery')

  if (!isMaster) {
    redirect('/dashboard/upgrade?feature=whatsapp_ai')
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">
          Plano Master
        </p>
        <h1 className="font-brand text-2xl font-bold tracking-tight text-vyria-navy md:text-3xl">
          Hub Master
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-vyria-navy-muted">
          WhatsApp oficial, fidelidade e recuperação de clientes — cada módulo com painel
          dedicado.
        </p>
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((mod) => {
          const unlocked = hasFeature(plan, mod.feature)
          const inner = (
            <>
              <h2 className="font-brand text-lg font-bold text-vyria-navy">{mod.title}</h2>
              <p className="mt-2 text-sm text-vyria-navy-muted">{mod.description}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide">
                {mod.ready ? (
                  unlocked ? (
                    <span className="text-emerald-700">Disponível</span>
                  ) : (
                    <span className="text-amber-700">Requer Master</span>
                  )
                ) : (
                  <span className="text-violet-700">Em breve</span>
                )}
              </p>
            </>
          )
          const className = `rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm transition ${
            mod.ready && unlocked
              ? 'hover:border-violet-300 hover:shadow-md'
              : 'opacity-75'
          }`
          if (mod.ready && unlocked) {
            return (
              <Link key={mod.href} href={mod.href} className={className}>
                {inner}
              </Link>
            )
          }
          return (
            <div key={mod.href} className={className}>
              {inner}
            </div>
          )
        })}
      </div>
    </div>
  )
}
