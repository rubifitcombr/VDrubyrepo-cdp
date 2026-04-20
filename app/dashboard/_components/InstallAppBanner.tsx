'use client'

import { useEffect, useMemo, useState } from 'react'

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPrompt | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [dismissedThisSession, setDismissedThisSession] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(display-mode: standalone)')
    const refreshInstalled = () => setIsInstalled(media.matches)
    refreshInstalled()
    media.addEventListener('change', refreshInstalled)
    return () => media.removeEventListener('change', refreshInstalled)
  }, [])

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as DeferredInstallPrompt)
    }

    const onInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const shouldShow = useMemo(
    () => !isInstalled && !!deferredPrompt && !dismissedThisSession,
    [isInstalled, deferredPrompt, dismissedThisSession]
  )

  async function onInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome !== 'accepted') {
      dismissForSession()
    }
    setDeferredPrompt(null)
  }

  function dismissForSession() {
    setDismissedThisSession(true)
  }

  if (!shouldShow) return null

  return (
    <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[#7c2d12]">
          Instale o Vyria no seu celular para acesso rápido
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onInstall}
            className="rounded-lg bg-[var(--dash-primary)] px-3 py-1.5 text-sm font-semibold text-white transition-[filter] hover:brightness-105"
          >
            Instalar
          </button>
          <button
            type="button"
            onClick={dismissForSession}
            className="rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-sm font-medium text-[#7c2d12] hover:bg-orange-100"
          >
            Agora nao
          </button>
        </div>
      </div>
    </div>
  )
}
