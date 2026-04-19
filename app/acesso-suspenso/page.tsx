import { isVyriaAdminPanelUser } from '@/lib/admin-panel-user'
import { getDashboardAccessRedirectPath } from '@/lib/merchant-access-redirect.server'
import {
  parseVyriaPanelMode,
  VYRIA_PANEL_MODE_COOKIE,
} from '@/lib/vyria-panel-mode'
import { getUser } from '@/services/auth.server'
import { getStoreByUser } from '@/services/store.server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminWhatsappHref } from '@/lib/admin-whatsapp-href.server'
import { AcessoSuspensoClient } from './acesso-suspenso-client'

export default async function AcessoSuspensoPage() {
  const user = await getUser()
  if (!user) {
    redirect('/login?next=/acesso-suspenso')
  }

  const cookieStore = await cookies()
  const vyriaPanelMode = parseVyriaPanelMode(
    cookieStore.get(VYRIA_PANEL_MODE_COOKIE)?.value
  )
  if (isVyriaAdminPanelUser(user.id) && vyriaPanelMode === 'admin') {
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

  return <AcessoSuspensoClient whatsappHref={getAdminWhatsappHref()} />
}
