'use client'

import { useEffect } from 'react'

/**
 * Só no painel: scope `/dashboard/` para o SW **não** controlar o cardápio público /[slug]
 * (Safari móvel + caches antigos causavam 404 na loja).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const run = async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations()
        let hasDashboardScope = false
        for (const reg of regs) {
          try {
            const path =
              new URL(reg.scope).pathname.replace(/\/$/, '') || '/'
            if (path === '/dashboard') {
              hasDashboardScope = true
            } else {
              await reg.unregister()
            }
          } catch {
            await reg.unregister()
          }
        }
        if (!hasDashboardScope) {
          await navigator.serviceWorker.register('/sw.js', {
            scope: '/dashboard/',
            updateViaCache: 'none',
          })
        }
      } catch {
        /* ignore */
      }
    }

    void run()
  }, [])

  return null
}
