'use client'

import Link from 'next/link'

export function FidelidadeSetupGuide({ compact = false }: { compact?: boolean }) {
  const steps = [
    {
      n: '1',
      title: 'Defina as regras',
      desc: 'Pontos por real, valor do ponto, mínimo para resgatar e bónus de boas-vindas.',
    },
    {
      n: '2',
      title: 'Active o programa',
      desc: 'Ligue «Programa ativo». Sem isso, clientes não ganham nem resgatam pontos.',
    },
    {
      n: '3',
      title: 'Teste com um pedido real',
      desc: 'Peça pelo cardápio ou QR com telefone WhatsApp → marque como entregue → confira os pontos em Membros.',
    },
    {
      n: '4',
      title: '(Opcional) WhatsApp Master',
      desc: 'Na entrega, o cliente recebe agradecimento + saldo. Pode consultar pontos escrevendo «pontos» no chat.',
    },
  ]

  return (
    <section
      className={`rounded-2xl border border-[var(--card-border)] bg-white shadow-sm ${
        compact ? 'p-4' : 'p-6'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-vyria-navy-muted">
        Como configurar
      </p>
      {!compact ? (
        <p className="mt-2 text-sm text-vyria-navy-muted">
          O cliente não precisa de cadastro — a conta de fidelidade é o{' '}
          <strong className="text-vyria-navy">telefone WhatsApp</strong> usado no pedido.
        </p>
      ) : null}
      <ol className={`space-y-3 ${compact ? 'mt-3' : 'mt-4'}`}>
        {steps.map((step) => (
          <li key={step.n} className="flex gap-3 text-sm">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-vyria-plum text-xs font-bold text-white">
              {step.n}
            </span>
            <div>
              <p className="font-semibold text-vyria-navy">{step.title}</p>
              <p className="mt-0.5 text-xs text-vyria-navy-muted">{step.desc}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-950">
        <p className="font-semibold">Sugestão para começar</p>
        <p className="mt-1">
          1 ponto por R$ 1 · mínimo 100 pts · 1 centavo por ponto (100 pts = R$ 1,00) · boas-vindas
          0 ou 50 pts.
        </p>
      </div>
      <p className="mt-4 text-xs text-vyria-navy-muted">
        Resgate só no{' '}
        <Link href="/dashboard" className="font-semibold text-vyria-plum hover:underline">
          cardápio online
        </Link>
        . Ganho de pontos quando o pedido fica <strong>entregue</strong> no painel.
      </p>
    </section>
  )
}
