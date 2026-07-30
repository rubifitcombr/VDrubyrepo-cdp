'use client'

import { useState } from 'react'

function CheckIcon({ done }: { done?: boolean }) {
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        done ? 'bg-emerald-100 text-emerald-800' : 'bg-violet-100 text-violet-800'
      }`}
    >
      {done ? '✓' : '•'}
    </span>
  )
}

function FaqItem({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-vyria-navy"
      >
        {title}
        <span className="text-vyria-navy-muted">{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <div className="border-t border-[var(--card-border)] px-4 py-3 text-xs leading-relaxed text-vyria-navy-muted">
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function WhatsAppSetupGuide({
  isConnected,
  supportHref,
}: {
  isConnected: boolean
  supportHref?: string | null
}) {
  if (isConnected) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-950">
        <p className="font-semibold">WhatsApp ligado</p>
        <p className="mt-1 text-xs leading-relaxed">
          O assistente responde de forma profissional (IA), consulta pedidos e pontos, e
          direciona pedidos ao cardápio online — não registra pedidos pelo chat.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-800">
          Antes de conectar
        </p>
        <h3 className="mt-1 font-brand text-base font-bold text-vyria-navy">
          O que você precisa ter
        </h3>
        <ul className="mt-4 space-y-3">
          <li className="flex gap-3 text-sm text-vyria-navy">
            <CheckIcon />
            <span>
              <strong className="font-semibold">Celular com WhatsApp Business</strong> da loja
              <span className="mt-0.5 block text-xs text-vyria-navy-muted">
                Pode ser um chip só do comércio — o número que os clientes já usam para pedir.
              </span>
            </span>
          </li>
          <li className="flex gap-3 text-sm text-vyria-navy">
            <CheckIcon />
            <span>
              <strong className="font-semibold">Conta Facebook ou Meta Business</strong> da loja
              <span className="mt-0.5 block text-xs text-vyria-navy-muted">
                Grátis e leva poucos minutos. Não precisa de página famosa — só para autorizar a
                conexão.
              </span>
            </span>
          </li>
        </ul>
      </div>

      <div className="rounded-2xl border border-[var(--card-border)] bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-vyria-navy-muted">
          Como funciona
        </p>
        <ol className="mt-3 space-y-4">
          {[
            {
              n: '1',
              title: 'Clique em «Conectar com Facebook»',
              desc: 'Abre o site seguro da Meta — a Vyria não vê a sua senha.',
            },
            {
              n: '2',
              title: 'Escolha o WhatsApp da loja',
              desc: 'Seleccione o número que os clientes usam. A Vyria não cadastra números por você.',
            },
            {
              n: '3',
              title: 'Pronto — tudo automático',
              desc: 'Robô, mensagens e fidelidade passam a usar esse número. Sem copiar códigos.',
            },
          ].map((step) => (
            <li key={step.n} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-vyria-plum text-xs font-bold text-white">
                {step.n}
              </span>
              <div>
                <p className="text-sm font-semibold text-vyria-navy">{step.title}</p>
                <p className="mt-0.5 text-xs text-vyria-navy-muted">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-vyria-navy-muted">
          Dúvidas frequentes
        </p>
        <FaqItem title="Não tenho número só da loja">
          <p>
            Use um <strong>chip pré-pago</strong> ou um segundo número no celular. Instale o app{' '}
            <strong>WhatsApp Business</strong> nesse chip e use-o na conexão. Muitos comércios
            começam assim.
          </p>
        </FaqItem>
        <FaqItem title="Não tenho Facebook da loja">
          <p>
            Crie uma conta gratuita em{' '}
            <a
              href="https://www.facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-vyria-plum hover:underline"
            >
              facebook.com
            </a>{' '}
            com o nome do comércio. Depois aceda a{' '}
            <a
              href="https://business.facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-vyria-plum hover:underline"
            >
              business.facebook.com
            </a>{' '}
            para associar o WhatsApp. Não precisa de seguidores.
          </p>
        </FaqItem>
        <FaqItem title="Uso meu WhatsApp pessoal hoje">
          <p>
            Pode migrar para <strong>WhatsApp Business</strong> no mesmo aparelho (faça backup
            antes). Na conexão, escolha esse número. Os clientes continuam a falar com o mesmo
            telefone.
          </p>
        </FaqItem>
        <FaqItem title="Não quero usar WhatsApp agora">
          <p>
            Sem problema — o resto do sistema (cardápio, pedidos, PDV) funciona normalmente. O
            WhatsApp Master é opcional e pode activar quando quiser.
          </p>
        </FaqItem>
      </div>

      {supportHref ? (
        <p className="text-center text-xs text-vyria-navy-muted">
          Precisa de ajuda para configurar?{' '}
          <a
            href={supportHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-vyria-plum hover:underline"
          >
            Falar com suporte Vyria
          </a>
        </p>
      ) : null}
    </div>
  )
}
