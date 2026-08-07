'use client'

import { useEffect, useState } from 'react'
import { shouldDeferClientReload } from '@/lib/client-reload-guard'
import { DASHBOARD_CLIENT_VERSION } from '@/lib/dashboard-client-version'

const STORAGE_KEY = 'vyria-dashboard-client-version'
const CHECK_INTERVAL_MS = 60_000
const DEFER_RETRY_MS = 5_000

async function clearCachesAndReload(versionKey: string): Promise<void> {
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch {
    /* ignore */
  }

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((reg) => reg.unregister()))
    }
  } catch {
    /* ignore */
  }

  window.localStorage.setItem(STORAGE_KEY, versionKey)
  window.location.reload()
}

/**
 * Garante que todos os painéis usam a mesma versão do cliente após deploy.
 * - Checa em cada carga e a cada 60s contra `/api/health/build`.
 * - Adia reload se input com foco ou `dashboardFetch` em voo.
 */
export function DashboardClientVersionGuard({ buildId }: { buildId: string }) {
  const [updating, setUpdating] = useState(false)
  const bundledVersionKey = `${DASHBOARD_CLIENT_VERSION}:${buildId}`

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (process.env.NODE_ENV === 'development') return

    let disposed = false
    let deferTimer: ReturnType<typeof setTimeout> | null = null

    async function applyReload(versionKey: string): Promise<void> {
      if (shouldDeferClientReload()) {
        if (deferTimer) clearTimeout(deferTimer)
        deferTimer = setTimeout(() => {
          deferTimer = null
          void applyReload(versionKey)
        }, DEFER_RETRY_MS)
        return
      }
      if (disposed) return
      setUpdating(true)
      await clearCachesAndReload(versionKey)
    }

    async function ensureLatest() {
      const stored = window.localStorage.getItem(STORAGE_KEY)

      if (stored !== bundledVersionKey) {
        await applyReload(bundledVersionKey)
        return
      }

      try {
        const res = await fetch('/api/health/build', { cache: 'no-store' })
        if (!res.ok || disposed) return
        const json = (await res.json()) as {
          dashboardClientVersion?: string
          buildId?: string
        }
        const serverKey = `${json.dashboardClientVersion ?? ''}:${json.buildId ?? ''}`
        if (!serverKey || serverKey === ':' || serverKey === bundledVersionKey) return
        await applyReload(serverKey)
      } catch {
        /* rede indisponível — tenta no próximo ciclo */
      }
    }

    void ensureLatest()
    const id = window.setInterval(() => void ensureLatest(), CHECK_INTERVAL_MS)
    return () => {
      disposed = true
      if (deferTimer) clearTimeout(deferTimer)
      window.clearInterval(id)
    }
  }, [buildId, bundledVersionKey])

  if (!updating) return null

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-[9999] -translate-x-1/2 rounded-full bg-[#111827]/90 px-4 py-2 text-xs font-medium text-white shadow-lg"
      role="status"
      aria-live="polite"
    >
      Atualizando painel para a versão mais recente…
    </div>
  )
}
