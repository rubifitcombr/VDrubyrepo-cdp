'use client'

import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'

const cardClass =
  'w-full max-w-md rounded-2xl border border-[var(--card-border)] bg-white p-8 shadow-xl shadow-vyria-navy-deep/10 sm:p-10'

function messageForError(raw: string | null): string {
  const e = (raw || '').toLowerCase().trim()
  switch (e) {
    case 'pendente':
      return 'Seu cadastro está aguardando ativação. Entre em contato para contratar um plano.'
    case 'bloqueado':
      return 'Seu acesso foi suspenso. Entre em contato para regularizar.'
    case 'cancelado':
      return 'Sua assinatura foi cancelada. Entre em contato para reativar.'
    case 'plano_vencido':
      return 'Seu plano venceu. Entre em contato para renovar.'
    default:
      return 'Não foi possível aceder ao painel. Entre em contato com o suporte.'
  }
}

function Inner() {
  const params = useSearchParams()
  const router = useRouter()
  const error = params.get('error')
  const wa = process.env.NEXT_PUBLIC_ADMIN_WHATSAPP?.trim() || ''

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login?next=/acesso-suspenso')
    })
  }, [router])

  const href =
    wa && /^\d+$/.test(wa.replace(/\D/g, ''))
      ? `https://wa.me/${wa.replace(/\D/g, '')}`
      : undefined

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#faf8f6] px-4 py-12">
      <div className={cardClass}>
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-vyria-plum">
          Vyria Delivery
        </p>
        <h1 className="font-brand mt-4 text-center text-xl font-bold tracking-tight text-vyria-navy">
          Acesso ao painel
        </h1>
        <p className="mt-4 text-center text-sm leading-relaxed text-vyria-navy-muted">
          {messageForError(error)}
        </p>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-vyria-gradient mt-8 flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold"
          >
            Falar no WhatsApp
          </a>
        ) : (
          <p className="mt-6 text-center text-xs text-vyria-navy-muted">
            Configura <code className="rounded bg-black/[0.04] px-1">NEXT_PUBLIC_ADMIN_WHATSAPP</code>{' '}
            no projeto para mostrar o botão do WhatsApp.
          </p>
        )}
        <p className="mt-6 text-center text-sm text-vyria-navy-muted">
          <Link href="/login" className="font-semibold text-vyria-plum hover:text-vyria-orange">
            Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  )
}

export function AcessoSuspensoClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-[#faf8f6]">
          <p className="text-sm text-vyria-navy-muted">A carregar…</p>
        </div>
      }
    >
      <Inner />
    </Suspense>
  )
}
