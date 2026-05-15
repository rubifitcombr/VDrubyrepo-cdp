'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { Plan } from '@/lib/plan'
import { planTitle } from '@/lib/plan'
import { createClient } from '@/lib/supabase/client'
import { slugChannelSourcesForSupabaseIn } from '@/lib/slug-channel-orders'
import { IconBell, IconSearch } from './NavIcons'
import { DashboardNotificationPrompt } from './DashboardNotificationPrompt'

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
  storeId,
  plan,
  notificationCount,
  slugChannelSourcesOnly = false,
}: {
  storeName: string | null
  storeLogoUrl: string | null
  storeId: string | null
  plan: Plan
  notificationCount: number
  slugChannelSourcesOnly?: boolean
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [pendingCount, setPendingCount] = useState(notificationCount)

  useEffect(() => {
    setPendingCount(notificationCount)
  }, [notificationCount])

  useEffect(() => {
    if (!storeId) return
    const supabase = createClient()
    let disposed = false

    async function refreshPendingCount() {
      let q = supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('status', 'pending')
      if (slugChannelSourcesOnly) {
        q = q.in('source', slugChannelSourcesForSupabaseIn())
      }
      const { count, error } = await q
      if (!disposed && !error) {
        setPendingCount(count ?? 0)
      }
    }

    const channel = supabase
      .channel(`dashboard-topbar-pending-${storeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `store_id=eq.${storeId}`,
        },
        () => {
          void refreshPendingCount()
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void refreshPendingCount()
        }
      })

    const poll = window.setInterval(() => {
      void refreshPendingCount()
    }, 15000)

    return () => {
      disposed = true
      window.clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [storeId, slugChannelSourcesOnly])

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
        <DashboardNotificationPrompt />
        <Link
          href="/dashboard/orders"
          className="relative inline-flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-white p-2 text-[#1a1614] shadow-sm transition-colors hover:bg-[#f8f9fa] sm:px-2.5 sm:py-2"
          aria-label={`Ver pedidos pendentes: ${pendingCount}`}
        >
          <IconBell className="h-5 w-5" />
          <span className="hidden text-xs font-semibold text-[#4b5563] sm:inline">
            Pendentes: {pendingCount}
          </span>
          {pendingCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-[var(--dash-primary)] px-1 text-[10px] font-bold text-white">
              {pendingCount > 99 ? '99+' : pendingCount}
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
