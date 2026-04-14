'use client'

import { useRouter } from 'next/navigation'
import { signOut } from '@/services/auth'
import { IconLogout } from './NavIcons'

export function DashboardLogoutButton({
  size = 'default',
  className,
}: {
  size?: 'default' | 'compact'
  className?: string
} = {}) {
  const router = useRouter()

  async function handle() {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  const base =
    size === 'compact'
      ? 'inline-flex w-auto shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white/90 transition-colors hover:border-white/25 hover:bg-white/10'
      : 'flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-2.5 text-sm font-medium text-white/90 transition-colors hover:border-white/25 hover:bg-white/10'

  return (
    <button
      type="button"
      onClick={() => void handle()}
      className={[base, className].filter(Boolean).join(' ')}
    >
      <IconLogout className={size === 'compact' ? 'h-3.5 w-3.5 shrink-0' : 'h-4 w-4 shrink-0'} />
      Sair
    </button>
  )
}
