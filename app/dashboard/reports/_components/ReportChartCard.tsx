import type { ReactNode } from 'react'
import { IconChartBars } from '@/app/dashboard/_components/NavIcons'

export function ReportChartCard({
  title,
  icon,
}: {
  title: string
  icon?: ReactNode
}) {
  return (
    <section className="flex flex-col rounded-2xl border border-[var(--card-border)] bg-white p-5 shadow-sm shadow-black/[0.04] md:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--dash-primary)]/12 text-[var(--dash-primary)]">
          {icon ?? <IconChartBars className="h-5 w-5" />}
        </span>
        <h2 className="text-base font-bold text-[#1a1614] md:text-lg">{title}</h2>
      </div>
      <div className="mt-6 flex min-h-[200px] flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--card-border)] bg-[#f3f4f6] px-4 py-12 text-center text-sm font-medium text-[#9ca3af] md:min-h-[220px]">
        Gráfico será exibido aqui
      </div>
    </section>
  )
}
