type RouteLoadingFallbackProps = {
  /** Classes do contentor (ex.: fundo alinhado ao layout). */
  className?: string
  /**
   * `screen` — página inteira;
   * `compact` — bloco alto (Suspense / modais);
   * `bare` — só padding vertical (linha no topo do painel).
   */
  height?: 'screen' | 'compact' | 'bare'
}

/**
 * UI consistente para `loading.tsx` e Suspense fallbacks.
 */
export function RouteLoadingFallback({
  className = '',
  height = 'screen',
}: RouteLoadingFallbackProps) {
  const h =
    height === 'screen'
      ? 'min-h-dvh'
      : height === 'compact'
        ? 'min-h-[min(70dvh,28rem)] py-12'
        : 'py-10'

  return (
    <div
      className={`flex w-full flex-col items-center justify-center gap-4 bg-[#f4f5f7] px-4 ${h} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span
        className="h-10 w-10 shrink-0 animate-spin rounded-full border-[3px] border-vyria-plum/20 border-t-vyria-plum"
        aria-hidden
      />
      <p className="text-sm font-medium text-vyria-navy">A carregar…</p>
    </div>
  )
}
