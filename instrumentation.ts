export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.ENABLE_SERVER_CRON !== 'true') return

  const { scheduleVerificarVencimentosCron } = await import(
    /* webpackIgnore: true */ './jobs/cron-register.server'
  )
  scheduleVerificarVencimentosCron()
}
