'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { FiscalHistoryClient } from '@/app/dashboard/fiscal/_components/FiscalHistoryClient'
import { getUser } from '@/services/auth'
import { getStoreByUser } from '@/services/store'

export default function FiscalHistoricoPage() {
  const searchParams = useSearchParams()
  const fromHub = searchParams.get('hub') === 'fiscal'
  const [storeId, setStoreId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const user = await getUser()
        if (!user) return
        const store = await getStoreByUser(user.id)
        const s = store && typeof store === 'object' ? (store as Record<string, unknown>) : null
        if (!cancelled) setStoreId(typeof s?.id === 'string' ? s.id : null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto w-full max-w-3xl lg:max-w-4xl">
      {fromHub ? (
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#6b7280] transition-colors hover:text-[#1a1614]"
        >
          ← Voltar ao hub
        </Link>
      ) : (
        <nav className="text-xs text-[#6b7280]">
          <Link href="/dashboard" className="hover:text-[#1a1614]">
            Início
          </Link>
          <span className="mx-1.5">/</span>
          <Link href="/dashboard/fiscal" className="hover:text-[#1a1614]">
            Vyria Fiscal
          </Link>
          <span className="mx-1.5">/</span>
          <span className="font-medium text-[#1a1614]">Histórico</span>
        </nav>
      )}

      <header className={fromHub ? 'mt-3' : 'mt-4'}>
        <h1 className="text-2xl font-bold tracking-tight text-[#1a1614] md:text-3xl">
          Histórico Fiscal
        </h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          Acompanhe se cada NFC-e foi autorizada, rejeitada, cancelada ou está em contingência —
          com a mensagem devolvida pela SEFAZ.
        </p>
      </header>

      <div className="mt-8">
        {loading ? (
          <p className="text-sm text-[#9ca3af]">A carregar…</p>
        ) : storeId ? (
          <FiscalHistoryClient storeId={storeId} />
        ) : (
          <p className="rounded-2xl border border-dashed border-[var(--card-border)] bg-white px-6 py-10 text-center text-sm text-[#6b7280]">
            Não encontramos uma loja associada à sua conta.
          </p>
        )}
      </div>
    </div>
  )
}
