'use client'

import { useEffect, useState } from 'react'
import {
  GARCOM_PIN_SESSION_SYNC_EVENT,
  garcomPinSessionKey,
} from '@/lib/garcom-pin'

/** Reage a alterações de sessão PIN (localStorage cross-tab + mesma aba). */
export function useGarcomPinSessionRevision(storeId: string): number {
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!storeId || typeof window === 'undefined') return

    const bump = () => setRevision((n) => n + 1)

    const onStorage = (event: StorageEvent) => {
      if (event.key === garcomPinSessionKey(storeId)) bump()
    }
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<{ storeId?: string }>).detail
      if (!detail?.storeId || detail.storeId === storeId) bump()
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener(GARCOM_PIN_SESSION_SYNC_EVENT, onSync)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(GARCOM_PIN_SESSION_SYNC_EVENT, onSync)
    }
  }, [storeId])

  return revision
}
