'use client'

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'

type EmbeddedConfig = {
  available: boolean
  appId: string | null
  configId: string | null
}

type SessionInfo = {
  waba_id?: string
  phone_number_id?: string
  coexistence_finish?: boolean
}

function parseEmbeddedSignupMessage(data: unknown): SessionInfo | null {
  if (!data) return null
  try {
    const payload =
      typeof data === 'string'
        ? (JSON.parse(data) as Record<string, unknown>)
        : (data as Record<string, unknown>)
    if (payload.type !== 'WA_EMBEDDED_SIGNUP') return null
    const inner = payload.data as Record<string, unknown> | undefined
    const event = payload.event != null ? String(payload.event) : null
    const coexistenceFinish = event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'

    if (!inner && !coexistenceFinish) return null

    return {
      waba_id:
        inner?.waba_id != null
          ? String(inner.waba_id)
          : undefined,
      phone_number_id:
        inner?.phone_number_id != null
          ? String(inner.phone_number_id)
          : undefined,
      coexistence_finish: coexistenceFinish || undefined,
    }
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForEmbeddedSession(
  sessionRef: MutableRefObject<SessionInfo>,
  options: { coexistence?: boolean; maxMs?: number } = {}
): Promise<SessionInfo> {
  const maxMs = options.maxMs ?? (options.coexistence ? 10_000 : 4_000)
  const started = Date.now()
  while (Date.now() - started < maxMs) {
    const { waba_id, phone_number_id, coexistence_finish } = sessionRef.current
    const hasWaba = Boolean(waba_id)
    const hasPhone = Boolean(phone_number_id)
    if (hasWaba && (hasPhone || options.coexistence || coexistence_finish)) {
      return { waba_id, phone_number_id, coexistence_finish }
    }
    await sleep(150)
  }
  return sessionRef.current
}

export function WhatsAppEmbeddedConnect({
  disabled,
  supportHref = null,
  onConnected,
  onError,
}: {
  disabled?: boolean
  supportHref?: string | null
  onConnected: () => void
  onError: (message: string) => void
}) {
  const [config, setConfig] = useState<EmbeddedConfig | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [fbReady, setFbReady] = useState(false)
  const [sdkError, setSdkError] = useState<string | null>(null)
  const [sdkAttempt, setSdkAttempt] = useState(0)
  const sessionRef = useRef<SessionInfo>({})

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/master/whatsapp/embedded-config')
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Falha ao carregar configuração.')
        if (!cancelled) setConfig(json as EmbeddedConfig)
      } catch {
        if (!cancelled) {
          setConfig({ available: false, appId: null, configId: null })
        }
      } finally {
        if (!cancelled) setLoadingConfig(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== 'https://www.facebook.com' &&
        event.origin !== 'https://web.facebook.com'
      ) {
        return
      }
      const parsed = parseEmbeddedSignupMessage(event.data)
      if (!parsed) return
      sessionRef.current = { ...sessionRef.current, ...parsed }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (!config?.available || !config.appId) return

    setFbReady(false)
    setSdkError(null)

    const appId = config.appId
    let cancelled = false

    const markReady = () => {
      if (cancelled) return
      setFbReady(true)
      setSdkError(null)
    }

    const initFb = () => {
      if (!window.FB) return false
      try {
        window.FB.init({
          appId,
          cookie: true,
          xfbml: true,
          version: 'v21.0',
        })
      } catch {
        // SDK já inicializado
      }
      markReady()
      return true
    }

    if (initFb()) return

    window.fbAsyncInit = () => {
      initFb()
    }

    const fail = () => {
      if (cancelled) return
      setSdkError(
        'Não foi possível carregar o Facebook. Desactive bloqueadores e actualize a página.'
      )
    }

    const existing = document.getElementById('facebook-jssdk') as HTMLScriptElement | null
    if (existing) {
      existing.remove()
    }

    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js'
    script.async = true
    script.defer = true
    script.onload = () => {
      if (initFb()) return
      window.fbAsyncInit?.()
      const poll = window.setInterval(() => {
        if (initFb()) window.clearInterval(poll)
      }, 200)
      window.setTimeout(() => {
        window.clearInterval(poll)
        if (!window.FB) fail()
      }, 15000)
    }
    script.onerror = fail
    document.body.appendChild(script)

    return () => {
      cancelled = true
    }
  }, [config, sdkAttempt])

  const completeConnect = useCallback(
    async (code: string) => {
      const session = await waitForEmbeddedSession(sessionRef, { coexistence: true })
      const { waba_id, phone_number_id } = session
      if (!waba_id) {
        throw new Error(
          'A Meta não enviou os dados da conta. Aguarde o fim do cadastro no popup e tente de novo.'
        )
      }

      const res = await fetch('/api/master/whatsapp/embedded-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          waba_id,
          phone_number_id: phone_number_id || undefined,
          coexistence: true,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao ligar WhatsApp.')
      sessionRef.current = {}
      onConnected()
    },
    [onConnected]
  )

  const handleConnect = useCallback(() => {
    if (!config?.configId || !window.FB) {
      onError('SDK Facebook ainda não carregou. Tente novamente em alguns segundos.')
      return
    }

    setConnecting(true)
    sessionRef.current = {}

    window.FB.login(
      (response) => {
        void (async () => {
          try {
            const code = response.authResponse?.code
            if (!code) {
              if (response.status === 'unknown') {
                throw new Error('Conexão cancelada.')
              }
              throw new Error('Não foi possível obter autorização da Meta.')
            }
            await completeConnect(code)
          } catch (e) {
            onError(e instanceof Error ? e.message : 'Erro ao conectar.')
          } finally {
            setConnecting(false)
          }
        })()
      },
      {
        config_id: config.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          feature: 'whatsapp_embedded_signup',
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: 3,
        },
      }
    )
  }, [completeConnect, config?.configId, onError])

  if (loadingConfig) {
    return (
      <p className="text-sm text-vyria-navy-muted">A preparar conexão com a Meta…</p>
    )
  }

  if (!config?.available) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
        <p className="font-brand text-base font-bold text-vyria-navy">
          Conexão temporariamente indisponível
        </p>
        <p className="mt-2 text-sm text-vyria-navy-muted">
          A integração com a Meta está a ser activada. Tente novamente em alguns minutos ou
          solicite activação manual abaixo.
        </p>
        {supportHref ? (
          <a
            href={supportHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex rounded-xl bg-[#1877F2] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#166FE5]"
          >
            Falar com suporte
          </a>
        ) : null}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border-2 border-[#1877F2]/30 bg-gradient-to-br from-[#1877F2]/5 to-white p-6">
      <h3 className="font-brand text-lg font-bold text-vyria-navy">
        Conectar com coexistência
      </h3>
      <p className="mt-2 text-sm text-vyria-navy-muted">
        Mantenha o <strong className="font-semibold text-vyria-navy">WhatsApp Business no celular</strong>{' '}
        e ligue a API oficial em poucos minutos. No popup da Meta, confirme no telemóvel quando
        solicitado.
      </p>
      <ol className="mt-4 list-inside list-decimal space-y-1 text-xs text-vyria-navy-muted">
        <li>WhatsApp Business actualizado (v2.24.17+)</li>
        <li>Login com a conta Meta do negócio</li>
        <li>Confirmar no celular (QR ou código)</li>
      </ol>
      <button
        type="button"
        disabled={disabled || connecting || !fbReady}
        onClick={() => handleConnect()}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-5 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#166FE5] disabled:opacity-60 sm:w-auto"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.234 2.686.234v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.251h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
        </svg>
        {connecting ? 'A conectar…' : 'Conectar com Facebook'}
      </button>
      {!fbReady && !sdkError ? (
        <p className="mt-2 text-xs text-vyria-navy-muted">A preparar conexão com a Meta…</p>
      ) : null}
      {sdkError ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-red-700">{sdkError}</p>
          <button
            type="button"
            onClick={() => {
              setFbReady(false)
              setSdkError(null)
              setSdkAttempt((n) => n + 1)
            }}
            className="text-xs font-semibold text-vyria-plum hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}
    </div>
  )
}
