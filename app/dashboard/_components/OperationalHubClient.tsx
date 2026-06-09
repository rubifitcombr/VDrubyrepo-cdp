'use client'

import { useEffect, useState } from 'react'
import {
  IconBag,
  IconCart,
  IconChartBars,
  IconClipboard,
  IconHome,
  IconKds,
  IconMenuBook,
  IconTruck,
} from './NavIcons'
import { HubShortcutPinModal } from './HubShortcutPinModal'
import {
  clearHubPinUnlocks,
  hubPinUnlockStorageKey,
  hubPinShortcutForAccess,
  isHubPinActive,
  rememberHubPinUnlock,
  type HubPinConfig,
  type HubPinShortcut,
} from '@/lib/hub-shortcut-pin'

type PendingShortcut = {
  href: string
  shortcut: HubPinShortcut
}

function BalcaoTile({
  href,
  onOpen,
}: {
  href: string
  onOpen: (href: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(href)}
      className="group relative flex h-full min-h-[18rem] w-full overflow-hidden bg-gradient-to-br from-sky-500 to-cyan-500 p-6 text-white shadow-xl shadow-sky-500/15 ring-1 ring-sky-400/30 transition hover:brightness-105 active:brightness-95 lg:min-h-0 lg:p-8"
    >
      <span className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/15" />
      <span className="absolute -bottom-24 left-10 h-52 w-52 rounded-full bg-black/10" />
      <span className="relative flex w-full flex-col items-center justify-center text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/18 text-white ring-1 ring-white/25">
          <IconBag className="h-8 w-8" />
        </span>
        <span className="mt-6 font-brand text-4xl font-bold tracking-tight md:text-5xl">
          Balcão
        </span>
        <span className="mt-3 max-w-sm text-sm leading-relaxed text-white/86">
          Operação rápida para vender no balcão, abrir caixa e acompanhar pedidos.
        </span>
      </span>
    </button>
  )
}

function CenterTile({
  label,
  description,
  icon: Icon,
  tone,
  onOpen,
}: {
  label: string
  description: string
  icon: (p: { className?: string }) => React.ReactNode
  tone: 'green' | 'orange'
  onOpen: () => void
}) {
  const toneClass =
    tone === 'green'
      ? 'from-emerald-500 to-green-500 shadow-emerald-500/15'
      : 'from-orange-500 to-amber-500 shadow-orange-500/15'

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative flex h-full min-h-[14rem] w-full overflow-hidden bg-gradient-to-br p-6 text-white shadow-xl ring-1 ring-white/10 transition hover:brightness-105 active:brightness-95 lg:min-h-0 ${toneClass}`}
    >
      <span className="absolute -right-14 -top-14 h-40 w-40 rounded-full bg-white/14" />
      <span className="relative flex w-full flex-col items-center justify-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/18 ring-1 ring-white/25">
          <Icon className="h-7 w-7" />
        </span>
        <span className="mt-5 font-brand text-3xl font-bold tracking-tight">
          {label}
        </span>
        <span className="mt-2 max-w-xs text-sm leading-relaxed text-white/82">
          {description}
        </span>
      </span>
    </button>
  )
}

function SideShortcut({
  label,
  description,
  icon: Icon,
  badge,
  onOpen,
}: {
  label: string
  description: string
  icon: (p: { className?: string }) => React.ReactNode
  badge?: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block h-full w-full text-left"
    >
      <span className="group flex h-full min-h-[5.75rem] items-center gap-4 bg-gradient-to-br from-slate-800 to-slate-950 p-4 text-white shadow-sm shadow-black/[0.08] ring-1 ring-white/10 transition hover:brightness-110 active:brightness-95">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/18">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-brand text-lg font-bold">
            {label}
          </span>
          <span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-white/62">
            {description}
          </span>
        </span>
        {badge ? (
          <span className="shrink-0 rounded-full bg-white/12 px-2 py-1 text-xs font-bold text-white ring-1 ring-white/18">
            {badge}
          </span>
        ) : null}
      </span>
    </button>
  )
}

export function OperationalHubClient({
  storeId,
  hubPinConfig,
  balcaoHref,
  showBalcao,
  showSalao,
  showAutoatendimento,
  showCozinha,
  showDelivery,
  showMesas,
  showComandas,
  showDigitalMenu,
  digitalMenuHref,
  digitalMenuExternal,
  pendingOrders,
  gridClass,
  centerTileCount,
  sideShortcutCount,
}: {
  storeId: string
  hubPinConfig: HubPinConfig
  balcaoHref: string | null
  showBalcao: boolean
  showSalao: boolean
  showAutoatendimento: boolean
  showCozinha: boolean
  showDelivery: boolean
  showMesas: boolean
  showComandas: boolean
  showDigitalMenu: boolean
  digitalMenuHref: string
  digitalMenuExternal: boolean
  pendingOrders: number
  gridClass: string
  centerTileCount: number
  sideShortcutCount: number
}) {
  const [pendingShortcut, setPendingShortcut] = useState<PendingShortcut | null>(
    null
  )

  useEffect(() => {
    clearHubPinUnlocks(storeId)
  }, [storeId])

  function navigateToShortcut(href: string) {
    window.location.assign(href)
  }

  function openShortcut(href: string) {
    const url = new URL(href, window.location.origin)
    const shortcut = hubPinShortcutForAccess(url.pathname, url.searchParams.get('hub'))
    const entry = shortcut ? hubPinConfig[shortcut] : null

    const activeEntry = entry ?? undefined
    if (shortcut && isHubPinActive(activeEntry)) {
      setPendingShortcut({ href, shortcut })
      return
    }

    navigateToShortcut(href)
  }

  function confirmPin(pin: string) {
    if (!pendingShortcut) return false
    const entry = hubPinConfig[pendingShortcut.shortcut]
    if (!isHubPinActive(entry) || pin !== entry.pin) return false
    rememberHubPinUnlock(
      hubPinUnlockStorageKey(storeId, pendingShortcut.shortcut, entry.pin)
    )
    navigateToShortcut(pendingShortcut.href)
    setPendingShortcut(null)
    return true
  }

  return (
    <>
      <div className="min-h-dvh w-full overflow-y-auto lg:h-dvh lg:overflow-hidden">
        <section
          className={`grid min-h-dvh gap-px bg-black/15 lg:h-full lg:min-h-0 lg:overflow-hidden ${gridClass}`}
        >
          {showBalcao && balcaoHref ? (
            <BalcaoTile href={balcaoHref} onOpen={openShortcut} />
          ) : null}

          {centerTileCount > 0 ? (
            <div className="grid min-h-0 auto-rows-fr gap-px bg-black/15 lg:h-full">
              {showAutoatendimento ? (
                <CenterTile
                  label="QR Autoatendimento"
                  description="Abrir o QR para os clientes pedirem no salão."
                  icon={IconMenuBook}
                  tone="green"
                  onOpen={() => openShortcut('/dashboard/garcom?hub=salao')}
                />
              ) : null}
              {showSalao ? (
                <CenterTile
                  label="Salão / Mesas"
                  description="Abrir a janela do garçom e controlar o atendimento de salão."
                  icon={IconClipboard}
                  tone="green"
                  onOpen={() => openShortcut('/dashboard/garcom?hub=salao')}
                />
              ) : null}
              {showCozinha ? (
                <CenterTile
                  label="Cozinha"
                  description="Abrir o KDS para acompanhar preparo e pedidos prontos."
                  icon={IconKds}
                  tone="orange"
                  onOpen={() => openShortcut('/dashboard/kds?hub=cozinha')}
                />
              ) : null}
            </div>
          ) : null}

          {sideShortcutCount > 0 ? (
            <aside
              className={`grid min-h-0 auto-rows-fr gap-px bg-black/15 lg:h-full ${
                sideShortcutCount > 1 ? 'sm:grid-cols-2 lg:grid-cols-1' : 'grid-cols-1'
              }`}
            >
              {showDelivery ? (
                <SideShortcut
                  label="Delivery"
                  description="Abrir entregadores e corridas."
                  icon={IconTruck}
                  onOpen={() => openShortcut('/dashboard/entregadores?hub=delivery')}
                />
              ) : null}
              {showMesas ? (
                <SideShortcut
                  label="Mesas"
                  description="Ir direto para o mapa de mesas."
                  icon={IconClipboard}
                  onOpen={() => openShortcut('/dashboard/garcom?hub=mesas')}
                />
              ) : null}
              {showComandas ? (
                <SideShortcut
                  label="Comandas"
                  description="Ver pedidos e comandas abertas."
                  icon={IconCart}
                  badge={pendingOrders > 0 ? String(pendingOrders) : undefined}
                  onOpen={() => openShortcut('/dashboard/orders?hub=comandas')}
                />
              ) : null}
              {showDigitalMenu ? (
                digitalMenuExternal ? (
                  <a
                    href={digitalMenuHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-full"
                  >
                    <span className="group flex h-full min-h-[5.75rem] items-center gap-4 bg-gradient-to-br from-slate-800 to-slate-950 p-4 text-white shadow-sm shadow-black/[0.08] ring-1 ring-white/10 transition hover:brightness-110 active:brightness-95">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/18">
                        <IconMenuBook className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-brand text-lg font-bold">
                          Cardápio digital
                        </span>
                        <span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-white/62">
                          Abrir o link público da loja.
                        </span>
                      </span>
                    </span>
                  </a>
                ) : (
                  <SideShortcut
                    label="Cardápio digital"
                    description="Configurar o slug da loja."
                    icon={IconMenuBook}
                    onOpen={() => openShortcut(digitalMenuHref)}
                  />
                )
              ) : null}
              <SideShortcut
                label="Visão geral do dia"
                description="Abrir resumo diário, métricas e acompanhamento da operação."
                icon={IconChartBars}
                onOpen={() => openShortcut('/dashboard/visao?hub=visao')}
              />
              <SideShortcut
                label="Administração"
                description="Abrir o painel completo com sidebar."
                icon={IconHome}
                onOpen={() => openShortcut('/dashboard/visao?hub=administracao')}
              />
            </aside>
          ) : null}
        </section>
      </div>

      {pendingShortcut ? (
        <HubShortcutPinModal
          shortcut={pendingShortcut.shortcut}
          onCancel={() => setPendingShortcut(null)}
          onConfirm={confirmPin}
        />
      ) : null}
    </>
  )
}
