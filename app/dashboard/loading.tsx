import { RouteLoadingFallback } from '@/app/_components/RouteLoadingFallback'
import { DashboardPageSkeleton } from './_components/DashboardPageSkeleton'

export default function DashboardLoading() {
  return (
    <div className="bg-[var(--dash-surface)]">
      <div className="mx-auto flex w-full max-w-6xl justify-center px-4 pt-6 xl:max-w-7xl">
        <RouteLoadingFallback
          height="bare"
          className="rounded-2xl border border-[var(--card-border)] bg-white/90 px-8 shadow-sm"
        />
      </div>
      <DashboardPageSkeleton />
    </div>
  )
}
