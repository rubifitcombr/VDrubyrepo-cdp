'use client'

import { PublicSlugPathPill } from '@/app/_components/PublicSlugPathPill'
import { StorePublicQrPanel } from '@/app/dashboard/_components/StorePublicQrPanel'
import { useState } from 'react'

export function DashboardStoreControls({
  storeSlug,
  origin,
}: {
  storeSlug: string | null
  origin: string
}) {
  const [copied, setCopied] = useState(false)

  const publicUrl =
    storeSlug && origin
      ? `${origin.replace(/\/$/, '')}/${storeSlug}`
      : ''

  function copyLink() {
    if (!publicUrl) return
    void navigator.clipboard.writeText(publicUrl).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      },
      () => alert(`Copia manualmente: ${publicUrl}`)
    )
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--card-border)] bg-white p-4 md:p-5">
      <div>
        <p className="text-sm font-semibold text-[#1a1614]">Link público</p>
      </div>
      {storeSlug && publicUrl ? (
        <>
          <div className="flex flex-col gap-3 border-t border-[var(--card-border)] pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mt-1 flex justify-start" title={publicUrl}>
                <PublicSlugPathPill slug={storeSlug} />
              </div>
              <p className="mt-1.5 truncate text-[11px] text-[#6b7280]">{publicUrl}</p>
            </div>
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 rounded-lg bg-[var(--dash-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-105"
            >
              {copied ? 'Copiado' : 'Copiar link'}
            </button>
          </div>
          <StorePublicQrPanel publicUrl={publicUrl} storeSlug={storeSlug} qrCheckoutMode="delivery_pickup" />
        </>
      ) : (
        <p className="text-sm text-[#9ca3af]">Define o slug em Configurações.</p>
      )}
    </div>
  )
}
