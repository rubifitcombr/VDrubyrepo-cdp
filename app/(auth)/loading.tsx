import { RouteLoadingFallback } from '@/app/_components/RouteLoadingFallback'

/** Login, registo e rotas do grupo (auth). */
export default function AuthSegmentLoading() {
  return (
    <RouteLoadingFallback
      height="compact"
      className="rounded-2xl border border-[var(--card-border)] bg-white shadow-xl shadow-vyria-navy-deep/10"
    />
  )
}
