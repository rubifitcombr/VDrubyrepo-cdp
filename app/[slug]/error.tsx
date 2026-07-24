'use client'

import { useEffect } from 'react'

export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[storefront]', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-vyria-plum">
        Cardápio indisponível
      </p>
      <h1 className="font-brand mt-3 text-2xl font-bold text-vyria-navy">
        Não foi possível carregar a loja
      </h1>
      <p className="mt-2 max-w-md text-sm text-vyria-navy-muted">
        O servidor demorou demasiado a responder ou houve um erro temporário.
        Tenta novamente em instantes.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="btn-vyria-gradient mt-8 rounded-xl px-6 py-3 text-sm font-semibold"
      >
        Tentar de novo
      </button>
    </div>
  )
}
