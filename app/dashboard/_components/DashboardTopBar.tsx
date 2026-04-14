'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Plan } from '@/lib/plan'
import { planTitle } from '@/lib/plan'
import { IconBell, IconSearch } from './NavIcons'

function storeInitials(name: string | null): string {
  if (!name?.trim()) return 'VY'
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length >= 2)
    return (p[0][0] + p[1][0]).toUpperCase().slice(0, 2)
  return name.trim().slice(0, 2).toUpperCase()
}

export function DashboardTopBar({
  storeName,
  storeLogoUrl,
  plan,
  notificationCount,
}: {
  storeName: string | null
  storeLogoUrl: string | null
  plan: Plan
  notificationCount: number
}) {
  const router = useRouter()
  const [q, setQ] = useState('')

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    router.push('/dashboard/orders')
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
      <form
        onSubmit={onSearch}
        className="relative min-w-0 flex-1 max-sm:order-2 sm:max-w-xl"
      >
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
        <input
          type="search"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar pedidos, produtos..."
          className="w-full rounded-xl border border-[var(--card-border)] bg-[#f3f4f6] py-2.5 pl-10 pr-3 text-sm text-[#1a1614] outline-none ring-[var(--dash-primary)]/0 transition-[box-shadow,border-color] placeholder:text-[#9ca3af] focus:border-[var(--dash-primary)]/40 focus:bg-white focus:ring-2 focus:ring-[var(--dash-primary)]/15"
          autoComplete="off"
        />
      </form>

      <div className="flex shrink-0 items-center justify-end gap-3 sm:ml-auto">
        <Link
          href="/dashboard/orders"
          className="relative rounded-xl border border-[var(--card-border)] bg-white p-2.5 text-[#1a1614] shadow-sm transition-colors hover:bg-[#f8f9fa]"
          aria-label="Ver pedidos com alertas"
        >
          <IconBell className="h-5 w-5" />
          {notificationCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-[var(--dash-primary)] px-1 text-[10px] font-bold text-white">
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          ) : null}
        </Link>

        <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-[var(--card-border)] bg-white py-1.5 pl-1.5 pr-3 shadow-sm">
          <span className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[var(--dash-primary)] text-sm font-bold text-white ring-1 ring-black/5">
            {storeLogoUrl ? (
              <Image
                src={storeLogoUrl}
                alt={storeName?.trim() ? `Logo ${storeName}` : 'Logo da loja'}
                fill
                className="object-cover"
                sizes="40px"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                {storeInitials(storeName)}
              </span>
            )}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-bold text-[#1a1614]">
              {storeName?.trim() || 'A tua loja'}
            </p>
            <p className="truncate text-xs text-[#6b7280]">{planTitle(plan)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
