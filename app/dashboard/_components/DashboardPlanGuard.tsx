'use client'

import type { Plan } from '@/lib/plan'
import { isPathAllowedForMerchantPlan } from '@/lib/dashboard-menu'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

function PlanRestrictedNotice() {
  const pathname = usePathname()
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (pathname !== '/planos' && !pathname.startsWith('/dashboard/planos')) {
      const t = window.setTimeout(() => setVisible(false), 0)
      return () => window.clearTimeout(t)
      return
    }
    const sp = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.search : ''
    )
    if (sp.get('planRestricted') !== '1') {
      const t = window.setTimeout(() => setVisible(false), 0)
      return () => window.clearTimeout(t)
      return
    }
    const openT = window.setTimeout(() => setVisible(true), 0)
    const t = window.setTimeout(() => {
      setVisible(false)
      router.replace('/planos', { scroll: false })
    }, 5200)
    return () => {
      window.clearTimeout(openT)
      window.clearTimeout(t)
    }
  }, [pathname, router])

  if (!visible) return null

  return (
    <div
      className="pointer-events-none fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[60] w-[min(92vw,24rem)] -translate-x-1/2 md:bottom-8"
      role="status"
    >
      <div className="pointer-events-auto rounded-2xl border border-[var(--card-border)] bg-[#1a1614] px-4 py-3 text-center shadow-lg shadow-black/25">
        <p className="text-sm font-medium text-white">
          Esse recurso não está disponível no seu plano atual.
        </p>
        <Link
          href="/planos"
          className="mt-2 inline-block text-sm font-semibold text-[var(--dash-primary)] underline-offset-2 hover:underline"
        >
          Ver planos
        </Link>
      </div>
    </div>
  )
}

export function DashboardPlanGuard({
  plan,
  children,
}: {
  plan: Plan
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const redirecting = useRef(false)

  useEffect(() => {
    if (!pathname || redirecting.current) return
    if (isPathAllowedForMerchantPlan(pathname, plan)) return
    redirecting.current = true
    router.replace('/planos?planRestricted=1')
  }, [pathname, plan, router])

  return (
    <>
      {children}
      <PlanRestrictedNotice />
    </>
  )
}
