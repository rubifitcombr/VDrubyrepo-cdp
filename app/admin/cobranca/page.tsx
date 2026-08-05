import { AdminCobrancaClient } from '@/app/admin/cobranca/_components/AdminCobrancaClient'

export default function AdminCobrancaPage() {
  return (
    <AdminCobrancaClient initialWebhookUrl="https://acesseseusistemavyria.online/api/webhooks/mercadopago" />
  )
}
