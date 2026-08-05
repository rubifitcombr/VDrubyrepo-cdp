'use client'

function IconLock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 10V8a5 5 0 0 1 10 0v2M6 10h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconGift({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8M12 22V12M12 12H4.5a1.5 1.5 0 0 1 0-3c1.5 0 2.5 1.5 3.5 3 1-1.5 2-3 3.5-3a1.5 1.5 0 0 1 0 3H12ZM12 7V4M8 7c0-2 1.5-3 4-3s4 1 4 3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconStar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l2.9 6.26L22 9.27l-5 4.87L18.2 22 12 18.56 5.8 22l1.2-7.86-5-4.87 7.1-1.01L12 2z" />
    </svg>
  )
}

/** Partículas CSS puras — comemoração perto do prêmio final. */
function ConfettiBurst({ active }: { active: boolean }) {
  if (!active) return null

  const colors = ['#f97316', '#f43f5e', '#eab308', '#a855f7', '#22c55e']
  const particles = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    color: colors[i % colors.length]!,
    left: `${8 + (i * 9) % 84}%`,
    delay: `${(i * 0.12) % 0.8}s`,
    rotate: `${(i * 37) % 360}deg`,
    size: i % 2 === 0 ? '0.35rem' : '0.25rem',
  }))

  return (
    <div className="pointer-events-none absolute -inset-x-2 -top-3 bottom-0 overflow-hidden" aria-hidden>
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute top-1/2 motion-safe:animate-[confetti-float_2.4s_ease-out_infinite]"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.id % 3 === 0 ? '50%' : '2px',
            transform: `rotate(${p.rotate})`,
            animationDelay: p.delay,
            opacity: 0.85,
          }}
        />
      ))}
    </div>
  )
}

type MilestoneState = 'reached' | 'next' | 'future'

function milestoneState(
  saldo: number,
  value: number,
  nextTarget: number | null
): MilestoneState {
  if (saldo >= value) return 'reached'
  if (nextTarget === value) return 'next'
  return 'future'
}

type ConquestTrailProps = {
  saldo: number
  metaResgate: number
  pontosPorIndicacao: number
  canRedeem: boolean
}

export function ConquestTrail({
  saldo,
  metaResgate,
  pontosPorIndicacao,
  canRedeem,
}: ConquestTrailProps) {
  const step = Math.max(1, pontosPorIndicacao)
  const milestoneCount = Math.max(1, Math.ceil(metaResgate / step))
  const milestones = Array.from(
    { length: milestoneCount },
    (_, i) => Math.min((i + 1) * step, metaResgate)
  )
  const uniqueMilestones = [...new Set(milestones)]
  const progressPct = Math.min(100, Math.max(0, (saldo / metaResgate) * 100))
  const nextTarget = uniqueMilestones.find((m) => saldo < m) ?? null
  const trackTop = 'top-[1.65rem] sm:top-[2.35rem]'

  return (
    <div className="relative">
      <style>{`
        @keyframes confetti-float {
          0% { transform: translateY(0) rotate(0deg); opacity: 0.9; }
          100% { transform: translateY(-2.5rem) rotate(180deg); opacity: 0; }
        }
        @keyframes gift-invite-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251, 146, 60, 0.45), 0 8px 28px rgba(244, 63, 94, 0.35); }
          50% { box-shadow: 0 0 0 10px rgba(251, 146, 60, 0), 0 12px 36px rgba(234, 179, 8, 0.45); }
        }
        @keyframes gift-unlock-bounce {
          0%, 100% { transform: scale(1) rotate(-2deg); }
          25% { transform: scale(1.06) rotate(2deg); }
          50% { transform: scale(1.03) rotate(-1deg); }
          75% { transform: scale(1.08) rotate(1deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .motion-safe\\:animate-\\[confetti-float_2\\.4s_ease-out_infinite\\],
          .motion-safe\\:animate-\\[gift-invite-pulse_2\\.5s_ease-in-out_infinite\\],
          .motion-safe\\:animate-\\[gift-unlock-bounce_1\\.8s_ease-in-out_infinite\\] {
            animation: none !important;
          }
        }
      `}</style>

      <div className="overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div
          className="relative mx-auto w-full min-w-[17.5rem] max-w-full px-1 snap-x snap-mandatory sm:min-w-0 sm:px-2"
          style={{ minWidth: `${Math.max(uniqueMilestones.length * 4.75, 17.5)}rem` }}
        >
          {/* Caminho de conquista — fundo texturizado */}
          <div
            className={`absolute left-5 right-5 sm:left-8 sm:right-8 ${trackTop} h-2.5 rounded-full border border-orange-200/70 bg-gradient-to-r from-orange-100 via-rose-100 to-amber-100 shadow-inner sm:h-3`}
            aria-hidden
          />
          <div
            className={`absolute left-5 sm:left-8 ${trackTop} h-2.5 rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-amber-400 shadow-[0_0_12px_rgba(249,115,22,0.55)] transition-[width] duration-700 ease-out sm:h-3`}
            style={{ width: `calc((100% - 2.5rem) * ${progressPct / 100})` }}
            aria-hidden
          />

          <ol className="relative flex items-start justify-between gap-0.5 pt-0.5 sm:gap-1 sm:pt-1">
            {uniqueMilestones.map((value, index) => {
              const state = milestoneState(saldo, value, nextTarget)
              const isFinal = value === metaResgate
              const isReached = state === 'reached'
              const isNext = state === 'next'
              const isFuture = state === 'future'
              const prizeUnlocked = isFinal && canRedeem
              const prizeReached = isFinal && isReached
              const prizeInviting = isFinal && !canRedeem && !isReached

              const nodeBase =
                'relative z-10 flex flex-col items-center gap-2 transition-transform duration-200 focus-within:scale-105 motion-safe:hover:scale-105'

              let nodeRing =
                'flex items-center justify-center rounded-full border-2 transition-all duration-300'

              if (isFinal) {
                nodeRing += ' h-14 w-14 sm:h-[4.5rem] sm:w-[4.5rem] md:h-20 md:w-20 border-[3px]'
                if (prizeReached || prizeUnlocked) {
                  nodeRing +=
                    ' border-amber-300 bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500 text-amber-950 shadow-[0_0_28px_rgba(234,179,8,0.75),0_0_48px_rgba(244,63,94,0.35)] motion-safe:animate-[gift-unlock-bounce_1.8s_ease-in-out_infinite]'
                } else if (prizeInviting || isNext) {
                  nodeRing +=
                    ' border-orange-400 bg-gradient-to-br from-rose-100 via-orange-100 to-amber-200 text-orange-600 shadow-[0_8px_24px_rgba(251,146,60,0.45)] motion-safe:animate-[gift-invite-pulse_2.5s_ease-in-out_infinite]'
                } else {
                  nodeRing +=
                    ' border-amber-300/80 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-100 text-orange-500 shadow-[0_6px_20px_rgba(251,146,60,0.3)] motion-safe:animate-[gift-invite-pulse_3s_ease-in-out_infinite]'
                }
              } else if (isReached) {
                nodeRing +=
                  ' h-9 w-9 sm:h-11 sm:w-11 border-transparent bg-gradient-to-br from-orange-500 via-rose-500 to-amber-400 text-white shadow-[0_4px_14px_rgba(244,63,94,0.45)]'
              } else if (isNext) {
                nodeRing +=
                  ' h-9 w-9 sm:h-11 sm:w-11 border-rose-400 bg-white text-rose-600 shadow-[0_0_16px_rgba(244,63,94,0.35)] ring-4 ring-rose-200/50 motion-safe:animate-pulse'
              } else {
                nodeRing +=
                  ' h-9 w-9 sm:h-11 sm:w-11 border-orange-200/80 bg-white/90 text-orange-300/90 shadow-sm'
              }

              return (
                <li key={`${value}-${index}`} className={nodeBase}>
                  {isFinal ? (
                    <ConfettiBurst active={prizeUnlocked || prizeReached} />
                  ) : null}
                  <div
                    className={nodeRing}
                    title={`${value} pontos`}
                    aria-label={
                      isReached
                        ? `Marco de ${value} pontos alcançado`
                        : isNext
                          ? `Próximo marco: ${value} pontos`
                          : isFinal
                            ? canRedeem
                              ? 'Prêmio desbloqueado para resgate'
                              : `Prêmio de ${value} pontos — quase lá`
                            : `Marco de ${value} pontos bloqueado`
                    }
                  >
                    {isFinal ? (
                      <IconGift className="h-7 w-7 sm:h-9 sm:w-9 md:h-10 md:w-10 drop-shadow-sm" />
                    ) : isReached ? (
                      <IconStar className="h-4 w-4 drop-shadow" />
                    ) : isFuture ? (
                      <IconLock className="h-4 w-4 opacity-80" />
                    ) : (
                      <span className="text-xs font-bold tabular-nums">{value}</span>
                    )}
                  </div>
                  <span
                    className={`text-center text-[10px] font-bold leading-tight tabular-nums sm:text-xs ${
                      isReached
                        ? 'text-orange-600'
                        : isNext
                          ? 'text-rose-600'
                          : isFinal
                            ? 'text-amber-700'
                            : 'text-orange-300'
                    }`}
                  >
                    {isFinal ? (
                      <span className="block max-w-[3.25rem] sm:max-w-[4.5rem]">
                        {prizeReached || prizeUnlocked ? 'Prêmio!' : `${value} pts`}
                      </span>
                    ) : (
                      `${value}`
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-vyria-navy-muted sm:text-sm">
        <span className="font-bold tabular-nums text-orange-600">{saldo}</span>
        {' / '}
        <span className="font-semibold tabular-nums text-vyria-navy">{metaResgate}</span>{' '}
        pontos na trilha
      </p>
    </div>
  )
}
