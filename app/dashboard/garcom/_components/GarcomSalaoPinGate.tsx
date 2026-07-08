'use client'

import { GarcomPinModal } from '@/app/dashboard/_components/GarcomPinModal'
import type { StoreGarcomDTO } from '@/lib/garcons-types'
import {
  isGarcomPinSessionValid,
  isSalaoGarcomPinRequired,
  matchGarcomByPin,
  setGarcomPinSession,
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
      onCancel={() => {
        window.location.assign('/dashboard')
      }}
      onConfirm={(pin) => {
        const garcom = matchGarcomByPin(garcons, pin)
        if (!garcom) return false
        setGarcomPinSession(storeId, garcom)
        setUnlocked(true)
        return true
      }}
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
