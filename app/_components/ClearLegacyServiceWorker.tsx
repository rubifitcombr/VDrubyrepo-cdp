'use client'

import { useEffect } from 'react'

/**
 * Remove SW antigo com scope no site inteiro (causava 404/cache no /[slug] no mobile).
 * O SW novo regista-se só no dashboard com scope `/dashboard/`.
 */
export function ClearLegacyServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    void navigator.serviceWorker.getRegistrations().then(async (regs) => {
      for (const reg of regs) {
        try {
          const path = new URL(reg.scope).pathname.replace(/\/$/, '') || '/'
          if (path === '/' || path === '') {
            await reg.unregister()
          }
        } catch {
          await reg.unregister()
        }
      }
    })
  }, [])
  return null
}
