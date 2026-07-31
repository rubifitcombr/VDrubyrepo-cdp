'use client'

import { useEffect } from 'react'
import { DASHBOARD_CLIENT_VERSION } from '@/lib/dashboard-client-version'

const STORAGE_KEY = 'vyria-dashboard-client-version'

/**
 * Uma vez por versão: limpa caches + service workers antigos e recarrega.
 * Corrige menu desactualizado (ex.: «Recuperador» em vez de «Marketing») após deploy.
 */
export function DashboardClientVersionGuard({ buildId }: { buildId: string }) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (process.env.NODE_ENV === 'development') return

    const versionKey = `${DASHBOARD_CLIENT_VERSION}:${buildId}`
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === versionKey) return

    const run = async () => {
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

    void run()
  }, [buildId])

  return null
}
