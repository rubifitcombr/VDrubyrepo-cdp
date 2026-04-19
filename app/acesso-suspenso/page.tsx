import { isVyriaAdminPanelUser } from '@/lib/admin-panel-user'
import { getDashboardAccessRedirectPath } from '@/lib/merchant-access-redirect.server'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { redirect } from 'next/navigation'
import { AcessoSuspensoClient } from './acesso-suspenso-client'

export default async function AcessoSuspensoPage() {
  const user = await getUser()
  if (!user) {
    redirect('/login?next=/acesso-suspenso')
  }

  if (isVyriaAdminPanelUser(user.id)) {
    redirect('/admin')
  }

  const store = await getStoreByUser(user.id)
  const path = getDashboardAccessRedirectPath(
    store && typeof store === 'object'
      ? (store as Record<string, unknown>)
      : null
  )
  if (!path) {
    redirect('/dashboard')
  }

  return <AcessoSuspensoClient />
}
