'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

function playNewOrderBeep() {
  try {
    const w = window as Window & { __vyriaLastOrderBeepAt?: number }
    const now = Date.now()
    if (typeof w.__vyriaLastOrderBeepAt === 'number' && now - w.__vyriaLastOrderBeepAt < 900) {
      return
    }
    w.__vyriaLastOrderBeepAt = now
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    void ctx.resume?.()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.value = 0.065
    osc.start()
    osc.stop(ctx.currentTime + 0.11)
  } catch {
    /* ignore */
  }
}

function unlockAudioForMobile() {
  try {
    const w = window as Window & { __vyriaAudioUnlocked?: boolean }
    if (w.__vyriaAudioUnlocked) return
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.value = 0.0001
    osc.start()
    osc.stop(ctx.currentTime + 0.01)
    void ctx.resume?.()
    w.__vyriaAudioUnlocked = true
  } catch {
    /* ignore */
  }
}

type ServiceWorkerRegistrationLike = {
  showNotification?: (title: string, options?: NotificationOptions) => Promise<void>
  pushManager?: PushManager
}

function vapidKeyToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const out = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i)
  return out
}

async function showOrderNotification(title: string, body: string, url: string) {
  try {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return

    const options: NotificationOptions = {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag: 'vyria-new-order',
      data: { url },
    }

    const swContainer = navigator.serviceWorker
    if (swContainer?.ready) {
      const reg = (await swContainer.ready) as ServiceWorkerRegistrationLike
      if (typeof reg.showNotification === 'function') {
        await reg.showNotification(title, options)
        return
      }
    }

    const n = new Notification(title, options)
    n.onclick = () => {
      window.focus()
      window.location.href = url
      n.close()
    }
  } catch {
    /* ignore */
  }
}

export function DashboardOrderRealtimeNotifier({ storeId }: { storeId: string | null }) {
  const seenIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!storeId) return

    const w = window as Window & { __vyriaGlobalOrderNotifierActive?: boolean }
    w.__vyriaGlobalOrderNotifierActive = true

    const supabase = createClient()
    let closed = false

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => {})
    }

    async function ensurePushSubscription() {
      try {
        const vapidPublic = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim()
        if (!vapidPublic) return
        if (!('serviceWorker' in navigator)) return
        const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistrationLike
        if (!reg?.pushManager) return

        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
          if (
            typeof Notification !== 'undefined' &&
            Notification.permission !== 'granted'
          ) {
            return
          }
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapidKeyToUint8Array(vapidPublic),
          })
        }

        await fetch('/api/dashboard/push-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(sub.toJSON()),
        })
      } catch {
        /* ignore */
      }
    }

    void ensurePushSubscription()

    const onManualEnable = () => {
      unlockAudioForMobile()
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        void Notification.requestPermission()
          .then(() => ensurePushSubscription())
          .catch(() => {})
      } else {
        void ensurePushSubscription()
      }
    }

    const onInteraction = () => {
      unlockAudioForMobile()
    }
    window.addEventListener('pointerdown', onInteraction, { passive: true })
    window.addEventListener('touchstart', onInteraction, { passive: true })
    window.addEventListener('keydown', onInteraction, { passive: true })
    window.addEventListener('focus', onManualEnable)
    document.addEventListener('visibilitychange', onManualEnable)
    window.addEventListener('vyria-enable-notifications', onManualEnable as EventListener)

    const channel = supabase
      .channel(`dashboard-order-notify-${storeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `store_id=eq.${storeId}`,
        },
        (payload) => {
          const row = payload.new as { id?: string; customer_name?: string | null }
          const id = String(row.id ?? '')
          if (!id) return
          if (seenIdsRef.current.has(id)) return
          seenIdsRef.current.add(id)

          playNewOrderBeep()
          const customer = (row.customer_name ?? '').toString().trim() || 'Cliente'
          const body = `Novo pedido de ${customer}.`
          void showOrderNotification('Novo pedido recebido', body, '/dashboard/orders')
        }
      )
      .subscribe()

    return () => {
      closed = true
      void supabase.removeChannel(channel)
      window.removeEventListener('pointerdown', onInteraction as EventListener)
      window.removeEventListener('touchstart', onInteraction as EventListener)
      window.removeEventListener('keydown', onInteraction as EventListener)
      window.removeEventListener('focus', onManualEnable)
      document.removeEventListener('visibilitychange', onManualEnable)
      window.removeEventListener('vyria-enable-notifications', onManualEnable as EventListener)
      w.__vyriaGlobalOrderNotifierActive = false
    }
  }, [storeId])

  return null
}

