import { assertAdminLayout } from '@/lib/admin-auth.server'
import { AdminShell } from '@/app/admin/_components/AdminShell'
import {
  parseVyriaPanelMode,
  VYRIA_PANEL_MODE_COOKIE,
} from '@/lib/vyria-panel-mode'
import { cookies } from 'next/headers'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { email } = await assertAdminLayout()
  const cookieStore = await cookies()
  const vyriaPanelMode = parseVyriaPanelMode(
    cookieStore.get(VYRIA_PANEL_MODE_COOKIE)?.value
  )
  return (
    <AdminShell adminEmail={email} vyriaPanelMode={vyriaPanelMode}>
      {children}
    </AdminShell>
  )
}
