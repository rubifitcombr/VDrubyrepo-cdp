import Link from 'next/link'

const FEATURE_LABEL: Record<string, { title: string; minPlan: string }> = {
  orders: { title: 'Pedidos em tempo real', minPlan: 'Growth' },
  pdv: { title: 'PDV / balcão presencial', minPlan: 'Growth' },
  promotions: { title: 'Promoções (cupons e campanhas)', minPlan: 'Growth' },
  reports: { title: 'Relatórios de vendas', minPlan: 'Growth' },
  reports_advanced: { title: 'Relatórios avançados', minPlan: 'Pro' },
  appearance: { title: 'Aparência (cor, logo, banner)', minPlan: 'Growth' },
  automations: { title: 'Automações (mensagens e recuperação)', minPlan: 'Growth' },
  printing: { title: 'Impressão automática', minPlan: 'Pro' },
  kds: { title: 'KDS — monitor de cozinha', minPlan: 'Pro' },
  marketing_ai: {
    title: 'IA para produtos (descrições e imagens no plano Pro)',
    minPlan: 'Pro',
  },
  inventory: { title: 'Gestão de estoque', minPlan: 'Pro' },
  garcom: {
    title: 'Garçom / QR salão (Growth em modo presencial ou híbrido; mapa completo no Pro)',
    minPlan: 'Growth',
  },
  waiter: { title: 'Mapa de garçom no painel (pedidos por mesa)', minPlan: 'Pro' },
  cashier: { title: 'Caixa completo', minPlan: 'Pro' },
  pix_checkout: {
    title: 'Pagamento PIX no checkout (QR Code na conta do lojista)',
    minPlan: 'Pro',
  },
}

export default async function UpgradePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = (await searchParams) || {}
  const raw = sp.feature
  const feature = Array.isArray(raw) ? raw[0] : raw
  const meta = feature ? FEATURE_LABEL[feature] : null

  return (
    <div className="mx-auto w-full max-w-3xl md:max-w-4xl">
      <div className="rounded-2xl border border-[var(--card-border)] bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-vyria-plum">
          Recurso bloqueado
        </p>
        <h1 className="mt-2 font-brand text-2xl font-bold tracking-tight text-vyria-navy md:text-3xl">
          {meta ? meta.title : 'Este recurso está disponível em planos superiores'}
        </h1>
        <p className="mt-3 text-sm text-vyria-navy-muted">
          {meta ? (
            <>
              Para desbloquear, faz upgrade para o plano{' '}
              <span className="font-semibold text-vyria-navy">{meta.minPlan}</span>{' '}
              ou superior.
            </>
          ) : (
            'Faz upgrade para desbloquear este recurso.'
          )}
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--card-border)] bg-[#f9f9f9] p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-vyria-navy-muted">
              Start
            </p>
            <p className="mt-2 text-sm font-semibold text-vyria-navy">
              Presença online
            </p>
            <ul className="mt-3 space-y-1 text-sm text-vyria-navy-muted">
              <li>Dashboard, produtos, configs</li>
              <li>Relatórios de vendas (essencial)</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-[var(--card-border)] bg-[#f9f9f9] p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-vyria-navy-muted">
              Growth
            </p>
            <p className="mt-2 text-sm font-semibold text-vyria-navy">
              Operação completa
            </p>
            <ul className="mt-3 space-y-1 text-sm text-vyria-navy-muted">
              <li>Pedidos em tempo real</li>
              <li>Promoções, PDV e relatórios extra</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-[var(--card-border)] bg-[#f9f9f9] p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-vyria-navy-muted">
              Pro
            </p>
            <p className="mt-2 text-sm font-semibold text-vyria-navy">
              Balcão + cozinha + extras
            </p>
            <ul className="mt-3 space-y-1 text-sm text-vyria-navy-muted">
              <li>PDV, KDS, impressão</li>
              <li>Aparência e automações avançadas</li>
              <li>Relatórios avançados e IA de imagem</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/dashboard"
            className="rounded-xl border border-[var(--card-border)] bg-white px-5 py-3 text-center text-sm font-semibold text-vyria-navy hover:bg-[#f9f9f9]"
          >
            Voltar ao dashboard
          </Link>
          <a
            href="https://wa.me/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-vyria-gradient rounded-xl px-6 py-3 text-center text-sm font-semibold"
          >
            Falar com o suporte para upgrade
          </a>
        </div>
      </div>
    </div>
  )
}
