import 'server-only'

import cron from 'node-cron'
import { runVerificarVencimentosJob } from '@/jobs/verificarVencimentos.server'

/** 8h America/Sao_Paulo — só com `next start` e ENABLE_SERVER_CRON=true */
export function scheduleVerificarVencimentosCron() {
  cron.schedule(
    '0 8 * * *',
    () => {
      void runVerificarVencimentosJob().catch((e) =>
        console.error('[cron vencimentos]', e)
      )
    },
    { timezone: 'America/Sao_Paulo' }
  )
}
