import { RouteLoadingFallback } from '@/app/_components/RouteLoadingFallback'

export default function DashboardLoading() {
  return (
    <RouteLoadingFallback
      height="screen"
      className="bg-[var(--dash-surface)]"
    />
  )
}
