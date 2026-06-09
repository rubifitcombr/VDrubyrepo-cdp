'use client'

import { useEffect } from 'react'

function isLocalDevHost() {
  if (process.env.NODE_ENV === 'development') return true
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

/**
 * Só no painel: scope `/dashboard/` para o SW **não** controlar o cardápio público /[slug]
 * (Safari móvel + caches antigos causavam 404 na loja).
 * Em desenvolvimento o SW fica desligado para não cachear bundles do Turbopack.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let refreshing = false
    const onControllerChange = () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    }

    const run = async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations()

        if (isLocalDevHost()) {
          await Promise.all(regs.map((reg) => reg.unregister()))
          return
        }

        navigator.serviceWorker.addEventListener(
          'controllerchange',
          onControllerChange
        )

        let registration: ServiceWorkerRegistration | undefined
        let hasDashboardScope = false
        for (const reg of regs) {
          try {
            const path =
              new URL(reg.scope).pathname.replace(/\/$/, '') || '/'
            if (path === '/dashboard') {
              hasDashboardScope = true
              registration = reg
            } else {
              await reg.unregister()
            }
          } catch {
            await reg.unregister()
          }
        }

        if (!hasDashboardScope) {
          registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/dashboard/',
            updateViaCache: 'none',
          })
        }

        if (registration) {
          await registration.update()
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' })
          }
        }
      } catch {
        /* ignore */
      }
    }

    void run()

    return () => {
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange
      )
    }
  }, [])

  return null
}
