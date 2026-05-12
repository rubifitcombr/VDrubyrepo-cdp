import { EntregadoresManagePanel } from '@/app/dashboard/entregadores/_components/EntregadoresManagePanel'
import Link from 'next/link'

export default function EntregadoresPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-[#1a1614] sm:text-2xl">Entregadores</h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Cadastro da equipa de entregas. Ao registar uma entrega nos{' '}
          <Link href="/dashboard/orders" className="font-semibold text-[var(--dash-primary)] hover:underline">
            Pedidos
          </Link>{' '}
          escolhes aqui quem vai à rua; no{' '}
          <Link href="/dashboard/caixa" className="font-semibold text-[var(--dash-primary)] hover:underline">
            Caixa
          </Link>{' '}
          usas os mesmos nomes para acertos.
        </p>
      </header>
      <EntregadoresManagePanel />
    </div>
  )
}
