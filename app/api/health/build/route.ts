import { getAppBuildId } from '@/lib/app-build-id'
import { DASHBOARD_CLIENT_VERSION } from '@/lib/dashboard-client-version'
import { SW_CACHE_NAME } from '@/lib/sw-cache-version'

export const runtime = 'nodejs'

export async function GET() {
  return Response.json(
    {
      ok: true,
      menu: 'master-integrations',
      masterMenuItems: ['whatsapp', 'fidelidade', 'marketing'],
      features: {
        transactionalWhatsApp: true,
        marketingOpportunisticDispatch: true,
        marketingDailyCron: true,
      },
      dashboardClientVersion: DASHBOARD_CLIENT_VERSION,
      swCacheName: SW_CACHE_NAME,
      buildId: getAppBuildId(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      deployedAt: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  )
}
