import { getServiceWorkerScript } from '@/lib/service-worker-script.server'

export const runtime = 'nodejs'

export async function GET() {
  const body = getServiceWorkerScript()
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  })
}
