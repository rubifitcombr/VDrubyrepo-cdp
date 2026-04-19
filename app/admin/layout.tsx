import { assertAdminLayout } from '@/lib/admin-auth.server'
import { AdminShell } from '@/app/admin/_components/AdminShell'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { email } = await assertAdminLayout()
  return <AdminShell adminEmail={email}>{children}</AdminShell>
}
