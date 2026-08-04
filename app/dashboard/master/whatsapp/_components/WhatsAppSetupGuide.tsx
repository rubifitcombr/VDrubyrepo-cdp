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
        <p className="font-semibold">WhatsApp ligado com coexistência</p>
        <p className="mt-1 text-xs leading-relaxed">
          O número funciona na Vyria (robô, notificações) e continua no WhatsApp Business do
          celular.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 to-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-800">
          Como funciona
        </p>
        <h3 className="mt-1 font-brand text-base font-bold text-vyria-navy">
          Coexistência (app + Vyria)
        </h3>
        <ul className="mt-4 space-y-3">
          <li className="flex gap-3 text-sm text-vyria-navy">
            <CheckIcon />
            <span>
              <strong className="font-semibold">WhatsApp Business no celular</strong>
              <span className="mt-0.5 block text-xs text-vyria-navy-muted">
                O número que os clientes já usam — você não precisa desinstalar o app.
              </span>
            </span>
          </li>
          <li className="flex gap-3 text-sm text-vyria-navy">
            <CheckIcon />
            <span>
              <strong className="font-semibold">Conectar com Facebook</strong>
              <span className="mt-0.5 block text-xs text-vyria-navy-muted">
                Autorize na Meta e confirme no telemóvel (QR ou código).
              </span>
            </span>
          </li>
          <li className="flex gap-3 text-sm text-vyria-navy">
            <CheckIcon done />
            <span>
              <strong className="font-semibold">Activar o robô</strong>
              <span className="mt-0.5 block text-xs text-vyria-navy-muted">
                Depois da ligação, active o atendimento automático e teste com «oi».
              </span>
            </span>
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-vyria-navy-muted">
          Dúvidas frequentes
        </p>
        <FaqItem title="Preciso desligar o WhatsApp do celular?" defaultOpen>
          <p>
            <strong>Não.</strong> A coexistência mantém o app Business no telemóvel e a Vyria ao
            mesmo tempo.
          </p>
        </FaqItem>
        <FaqItem title="Erro ao fazer login com Facebook?">
          <p>
            A conta usada deve ser <strong>admin do negócio</strong> na Meta. Se o app Vyria estiver
            em modo Live, a Meta exige permissões Advanced Access (`public_profile`, `email` e
            WhatsApp). Contacte o suporte Vyria se o erro persistir.
          </p>
        </FaqItem>
        <FaqItem title="Não tenho número só da loja">
          <p>
            Use um chip com <strong>WhatsApp Business</strong> (versão 2.24.17 ou superior).
          </p>
        </FaqItem>
      </div>

      {supportHref ? (
        <p className="text-center text-xs text-vyria-navy-muted">
          Dúvidas?{' '}
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
