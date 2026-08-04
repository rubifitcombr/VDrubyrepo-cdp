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
  coexistenceMode = true,
}: {
  isConnected: boolean
  supportHref?: string | null
  coexistenceMode?: boolean
}) {
  if (isConnected) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-950">
        <p className="font-semibold">WhatsApp ligado</p>
        <p className="mt-1 text-xs leading-relaxed">
          {coexistenceMode
            ? 'O número funciona na Vyria (robô, notificações) e continua no WhatsApp Business do celular.'
            : 'O atendimento automático, notificações de pedido e fidelidade usam o número configurado pela Vyria.'}
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
          {coexistenceMode ? 'Coexistência (app + Vyria)' : 'Activação feita pela Vyria'}
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
              <strong className="font-semibold">
                {coexistenceMode ? 'Conectar com Facebook' : 'Solicitar activação'}
              </strong>
              <span className="mt-0.5 block text-xs text-vyria-navy-muted">
                {coexistenceMode
                  ? 'Autorize na Meta e confirme no telemóvel quando pedido (QR ou código).'
                  : 'Informe o telefone — a nossa equipa configura na Meta (API oficial).'}
              </span>
            </span>
          </li>
          <li className="flex gap-3 text-sm text-vyria-navy">
            <CheckIcon done />
            <span>
              <strong className="font-semibold">Pronto para usar</strong>
              <span className="mt-0.5 block text-xs text-vyria-navy-muted">
                Robô, notificações e fidelidade activam assim que a ligação estiver activa.
              </span>
            </span>
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-vyria-navy-muted">
          Dúvidas frequentes
        </p>
        {coexistenceMode ? (
          <>
            <FaqItem title="Preciso desligar o WhatsApp do celular?" defaultOpen>
              <p>
                <strong>Não.</strong> A coexistência permite usar o app Business no telemóvel e a
                Vyria ao mesmo tempo. Mensagens enviadas pelo celular continuam a funcionar.
              </p>
            </FaqItem>
            <FaqItem title="O que acontece ao clicar em Conectar com Facebook?">
              <p>
                Abre o cadastro oficial da Meta. Você faz login, escolhe o número Business e confirma
                no celular. A Vyria recebe a ligação automaticamente — sem copiar tokens.
              </p>
            </FaqItem>
          </>
        ) : (
          <FaqItem title="Por que não conecto com Facebook aqui?">
            <p>
              A Vyria gere a integração com a Meta para garantir estabilidade e suporte. Você só
              informa o número; nós fazemos a configuração técnica (WABA, webhook, templates).
            </p>
          </FaqItem>
        )}
        <FaqItem title="Não tenho número só da loja">
          <p>
            Use um chip pré-pago com <strong>WhatsApp Business</strong>. Muitos comércios começam
            assim.
          </p>
        </FaqItem>
        <FaqItem title="Deu erro «número já registado»?">
          <p>
            Use o botão <strong>Conectar com Facebook</strong> (coexistência), não a activação
            manual. Números já no app Business só entram pela Meta com confirmação no celular.
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
