'use client'

import { GarcomPinModal } from '@/app/dashboard/_components/GarcomPinModal'
import type { StoreGarcomDTO } from '@/lib/garcons-types'
import { dashboardFetch } from '@/lib/dashboard-fetch.client'
import {
  isGarcomPinSessionValid,
  isSalaoGarcomPinRequired,
  setGarcomPinSession,
  isGarcomPinActive,
} from '@/lib/garcom-pin'
import { useSyncExternalStore, useState } from 'react'

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
}

export function GarcomSalaoPinGate({
  storeId,
  garcons,
  children,
}: {
  storeId: string
  garcons: StoreGarcomDTO[]
  children: React.ReactNode
}) {
  const isClient = useIsClient()
  const pinRequired = isSalaoGarcomPinRequired(garcons)
  const [unlocked, setUnlocked] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  const sessionValid =
    isClient && pinRequired && isGarcomPinSessionValid(storeId, garcons)
  const allowed = !pinRequired || unlocked || sessionValid

  if (!isClient) {
    return (
      <div
        className="flex min-h-[min(28rem,80dvh)] items-center justify-center p-4"
        aria-hidden
      />
    )
  }

  if (allowed) {
    return <>{children}</>
  }

  return (
    <GarcomPinModal
      garconsWithPin={garcons.filter((g) => g.ativo && isGarcomPinActive(g))}
      onCancel={() => {
        window.location.assign('/dashboard')
      }}
      onConfirm={(pin) => {
        if (verifying) return false
        setVerifying(true)
        setPinError(null)
        void dashboardFetch('/api/waiter/pin/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        })
          .then(async (res) => {
            const json = (await res.json().catch(() => ({}))) as {
              error?: string
              garcom?: { id: string; nome: string }
            }
            if (!res.ok || !json.garcom) {
              setPinError(json.error || 'PIN inválido.')
              return
            }
            const garcom = garcons.find((g) => g.id === json.garcom!.id)
            if (!garcom) {
              setPinError('Garçom não encontrado.')
              return
            }
            setGarcomPinSession(storeId, garcom)
            setUnlocked(true)
          })
          .finally(() => {
            setVerifying(false)
          })
        return true
      }}
      externalError={pinError}
      verifying={verifying}
    />
  )
}

export function GarcomSessionBadge({
  nome,
  onTrocar,
}: {
  nome: string
  onTrocar?: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eff6ff] px-3 py-1.5 text-xs font-semibold text-[#1d4ed8]">
        Garçom: {nome}
      </span>
      {onTrocar ? (
        <button
          type="button"
          onClick={onTrocar}
          className="text-xs font-semibold text-[#6b7280] underline-offset-2 hover:text-[#1a1614] hover:underline"
        >
          Trocar PIN
        </button>
      ) : null}
    </div>
  )
}
