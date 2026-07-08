'use client'

import { GarconsManageClient } from '@/app/dashboard/garcons/_components/GarconsManageClient'
import { GarconsReportClient } from '@/app/dashboard/garcons/_components/GarconsReportClient'
import type { StoreGarcomDTO } from '@/lib/garcons-types'
import { useState } from 'react'

type View = 'cadastro' | 'relatorio'

export function GarconsPageClient({
  initialGarcons,
  initialMissingTable,
}: {
  initialGarcons: StoreGarcomDTO[]
  initialMissingTable: boolean
}) {
  const [view, setView] = useState<View>('cadastro')

  return (
    <div className="space-y-5">
      <div className="flex gap-6 border-b border-[#e5e7eb]">
        <button
          type="button"
          onClick={() => setView('cadastro')}
          className={`border-b-2 pb-2.5 text-sm font-semibold transition ${
            view === 'cadastro'
              ? 'border-[var(--dash-primary)] text-[var(--dash-primary)]'
              : 'border-transparent text-[#6b7280] hover:text-[#374151]'
          }`}
        >
          Meus garçons
        </button>
        <button
          type="button"
          onClick={() => setView('relatorio')}
          className={`border-b-2 pb-2.5 text-sm font-semibold transition ${
            view === 'relatorio'
              ? 'border-[var(--dash-primary)] text-[var(--dash-primary)]'
              : 'border-transparent text-[#6b7280] hover:text-[#374151]'
          }`}
        >
          Relatório de garçons
        </button>
      </div>

      {view === 'cadastro' ? (
        <GarconsManageClient
          initialGarcons={initialGarcons}
          initialMissingTable={initialMissingTable}
        />
      ) : (
        <GarconsReportClient />
      )}
    </div>
  )
}
