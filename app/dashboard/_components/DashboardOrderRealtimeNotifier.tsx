'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const NOTIFICATION_PREF_KEY = 'vyria-notifications-enabled'

function notificationsEnabled() {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(NOTIFICATION_PREF_KEY) !== '0'
}

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
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    const t = ctx.currentTime

    const osc1 = ctx.createOscillator()
    osc1.type = 'square'
    osc1.frequency.value = 980
    osc1.connect(gain)

    const osc2 = ctx.createOscillator()
    osc2.type = 'triangle'
    osc2.frequency.value = 1470
    osc2.connect(gain)

    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22)

    osc1.start(t)
    osc2.start(t)
    osc1.stop(t + 0.22)
    osc2.stop(t + 0.2)
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

export function DashboardOrderRealtimeNotifier({
  storeId,
  notifyOnNewOrder = true,
}: {
  storeId: string | null
  /** Quando false, desativa som e notificação no browser (toggle «Notificação de novo pedido» + plano Pro). */
  notifyOnNewOrder?: boolean
}) {
  const seenIdsRef = useRef<Set<string>>(new Set())
  const notificationsEnabledRef = useRef(true)

  useEffect(() => {
    if (!storeId) return

    const w = window as Window & { __vyriaGlobalOrderNotifierActive?: boolean }
    w.__vyriaGlobalOrderNotifierActive = true

    const supabase = createClient()
    notificationsEnabledRef.current = notificationsEnabled()

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

    const onManualEnable = (event?: Event) => {
      if (!notificationsEnabledRef.current) return
      unlockAudioForMobile()
      const isExplicitEnable =
        event?.type === 'vyria-enable-notifications' ||
        event?.type === 'pointerdown' ||
        event?.type === 'touchstart' ||
        event?.type === 'keydown'

      if (typeof Notification === 'undefined') return

      // Evita pedir permissão automaticamente (isso pode fazer o navegador "bloquear").
      // Só pede via gesto explícito do usuário.
      if (Notification.permission === 'default' && isExplicitEnable) {
        void Notification.requestPermission()
          .then(() => ensurePushSubscription())
          .catch(() => {})
        return
      }

      // Se já estiver "granted", só garante subscription; se "denied", não há o que fazer via JS.
      if (Notification.permission === 'granted') {
        void ensurePushSubscription()
      }
    }

    const onInteraction = () => {
      unlockAudioForMobile()
      onManualEnable(new Event('pointerdown'))
    }
    window.addEventListener('pointerdown', onInteraction, { passive: true })
    window.addEventListener('touchstart', onInteraction, { passive: true })
    window.addEventListener('keydown', onInteraction, { passive: true })
    // Em foco/visibilidade, só tenta subscription se já estiver permitido.
    window.addEventListener('focus', () => onManualEnable(new Event('focus')))
    document.addEventListener('visibilitychange', () =>
      onManualEnable(new Event('visibilitychange'))
    )
    window.addEventListener('vyria-enable-notifications', onManualEnable as EventListener)
    const onNotificationsToggle = (event: Event) => {
      const nextEnabled =
        (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled ?? false
      notificationsEnabledRef.current = nextEnabled
    }
    window.addEventListener('vyria-notifications-toggle', onNotificationsToggle as EventListener)

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
          if (!notifyOnNewOrder) return
          if (!notificationsEnabledRef.current) return
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
      void supabase.removeChannel(channel)
      window.removeEventListener('pointerdown', onInteraction as EventListener)
      window.removeEventListener('touchstart', onInteraction as EventListener)
      window.removeEventListener('keydown', onInteraction as EventListener)
      // (listeners anônimos não são removíveis; mantemos o cleanup só dos explícitos acima)
      window.removeEventListener('vyria-enable-notifications', onManualEnable as EventListener)
      window.removeEventListener(
        'vyria-notifications-toggle',
        onNotificationsToggle as EventListener
      )
      w.__vyriaGlobalOrderNotifierActive = false
    }
  }, [storeId, notifyOnNewOrder])

  return null
}

