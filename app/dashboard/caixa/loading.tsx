import { RouteLoadingFallback } from '@/app/_components/RouteLoadingFallback'

export default function CaixaLoading() {
  return (
    <RouteLoadingFallback
      height="compact"
      className="min-h-[420px] rounded-2xl bg-white"
    />
  )
}
