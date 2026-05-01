'use client'

import Link from 'next/link'
import { useCallback } from 'react'
import type { StorePrintingState } from '@/lib/store-printing'
import { openPrintingPreviewPopup } from '@/lib/printing-preview-window'
import { ReceiptPreview } from './ReceiptPreview'

export function PrintingPreviewClient({
  storeName,
  deliveryFee,
  initial,
}: {
  storeName: string
  deliveryFee: number
  initial: StorePrintingState
}) {
  const fee =
    Number.isFinite(deliveryFee) && deliveryFee >= 0 ? deliveryFee : 5.99

  const openTestWindow = useCallback(() => {
    const ok = openPrintingPreviewPopup({
      storeName,
      fee,
      values: {
        print_include_customer_details: initial.print_include_customer_details,
        print_delivery_copy: initial.print_delivery_copy,
      },
      returnPath: '/dashboard/printing/preview',
    })
    if (!ok) {
      alert('Permite pop-ups para testar a impressão.')
    }
  }, [fee, initial, storeName])

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex flex-col gap-4 border-b border-[var(--card-border)] pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/printing"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--dash-primary)] hover:underline"
          >
            ← Voltar à configuração de impressão
          </Link>
          <h1 className="font-brand mt-3 text-2xl font-bold tracking-tight text-vyria-navy md:text-3xl">
            Pré-visualização do cupom
          </h1>
          <p className="mt-1 text-sm text-vyria-navy-muted">
            Simulação de cupom térmico com base nas opções ativas. Usa o botão abaixo para testar
            impressão numa janela separada (com opção de voltar ao painel).
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-6">
        <div className="flex justify-center">
          <ReceiptPreview
            storeName={storeName}
            includeCustomer={initial.print_include_customer_details}
            deliveryCopy={initial.print_delivery_copy}
            deliveryFee={fee}
          />
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={openTestWindow}
            className="rounded-xl border border-[var(--card-border)] bg-white px-4 py-2.5 text-sm font-semibold text-vyria-navy shadow-sm hover:bg-[#f9fafb]"
          >
            Imprimir teste (janela)
          </button>
        </div>
      </div>
    </div>
  )
}
