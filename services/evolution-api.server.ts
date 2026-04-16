import 'server-only'

const DEFAULT_TIMEOUT_MS = 12_000

type EvolutionConfig = {
  baseUrl: string
  apiKey: string
}

type EvolutionJson = Record<string, unknown>

function readEvolutionConfig(): EvolutionConfig {
  const baseUrl = process.env.EVOLUTION_API_BASE_URL?.trim() || ''
  const apiKey = process.env.EVOLUTION_API_KEY?.trim() || ''
  if (!baseUrl || !apiKey) {
    throw new Error('EVOLUTION_API_BASE_URL e EVOLUTION_API_KEY são obrigatórios no servidor.')
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
  }
}

function normalizeInstanceName(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '')
  return cleaned.slice(0, 80)
}

export function getStoreEvolutionInstanceName(storeId: string): string {
  return normalizeInstanceName(`store_${storeId}`)
}

async function safeJson(response: Response): Promise<EvolutionJson | null> {
  try {
    const parsed = (await response.json()) as unknown
    if (parsed && typeof parsed === 'object') return parsed as EvolutionJson
    return null
  } catch {
    return null
  }
}

function formatEvolutionApiFailure(
  status: number,
  data: EvolutionJson | null,
  rawText: string
): string {
  if (data) {
    const errField = data.error
    if (typeof errField === 'string' && errField.trim()) return errField.trim()
    const resp = data.response
    if (resp && typeof resp === 'object') {
      const msg = (resp as Record<string, unknown>).message
      if (typeof msg === 'string' && msg.trim()) return msg.trim()
      if (Array.isArray(msg) && msg.length) return msg.map(String).join('; ')
    }
    return JSON.stringify(data).slice(0, 400)
  }
  if (rawText.trim()) return rawText.trim().slice(0, 400)
  return `HTTP ${status}`
}

async function evolutionRequest(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: EvolutionJson
): Promise<{ ok: boolean; status: number; data: EvolutionJson | null; rawText: string }> {
  const cfg = readEvolutionConfig()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  const url = `${cfg.baseUrl}${path.startsWith('/') ? path : `/${path}`}`

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.apiKey,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    })
    const data = await safeJson(response)
    const rawText = data ? '' : await response.text().catch(() => '')
    return { ok: response.ok, status: response.status, data, rawText }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timeout ao comunicar com Evolution API.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function pickString(source: unknown): string | null {
  if (typeof source === 'string' && source.trim()) return source.trim()
  return null
}

function extractQrCode(payload: EvolutionJson | null): string | null {
  if (!payload) return null
  const directKeys = ['qrcode', 'qr', 'base64', 'code']
  for (const key of directKeys) {
    const value = pickString(payload[key])
    if (value) return value
  }

  const nested = payload.base64 ?? payload.qrcode ?? payload.data ?? payload.instance
  if (nested && typeof nested === 'object') {
    const n = nested as Record<string, unknown>
    for (const key of directKeys) {
      const value = pickString(n[key])
      if (value) return value
    }
  }
  return null
}

function extractConnectionState(payload: EvolutionJson | null): string {
  if (!payload) return 'unknown'
  const instanceObj =
    payload.instance && typeof payload.instance === 'object'
      ? (payload.instance as Record<string, unknown>)
      : null
  const candidates = [
    payload.state,
    payload.status,
    payload.connectionStatus,
    payload.connection_state,
    instanceObj?.state,
    instanceObj?.status,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().toLowerCase()
    }
  }
  return 'unknown'
}

function isAlreadyInUseError(payload: EvolutionJson | null, rawText: string): boolean {
  const chunks: string[] = []
  if (rawText) chunks.push(rawText.toLowerCase())
  if (payload) {
    chunks.push(JSON.stringify(payload).toLowerCase())
    const responseObj =
      payload.response && typeof payload.response === 'object'
        ? (payload.response as Record<string, unknown>)
        : null
    if (responseObj) {
      if (typeof responseObj.message === 'string') {
        chunks.push(responseObj.message.toLowerCase())
      }
    }
  }
  return chunks.some((v) => v.includes('already in use') || v.includes('já está em uso'))
}

export async function ensureEvolutionInstance(instanceName: string): Promise<void> {
  const body = {
    instanceName,
    qrcode: false,
    integration: 'WHATSAPP-BAILEYS',
  }
  const attempt = await evolutionRequest('POST', '/instance/create', body)
  if (
    attempt.ok ||
    attempt.status === 409 ||
    isAlreadyInUseError(attempt.data, attempt.rawText)
  ) {
    return
  }
  const details = attempt.data ? JSON.stringify(attempt.data) : attempt.rawText
  throw new Error(`Falha ao criar instância (${attempt.status}): ${details.slice(0, 300)}`)
}

export async function getEvolutionConnectionState(instanceName: string): Promise<string> {
  const attempt = await evolutionRequest('GET', `/instance/connectionState/${encodeURIComponent(instanceName)}`)
  if (!attempt.ok) return 'unknown'
  return extractConnectionState(attempt.data)
}

export async function logoutEvolutionInstance(instanceName: string): Promise<void> {
  const attempt = await evolutionRequest(
    'DELETE',
    `/instance/logout/${encodeURIComponent(instanceName)}`
  )
  if (attempt.ok) {
    const errFlag = attempt.data?.error
    if (errFlag === true || errFlag === 'true') {
      const details = formatEvolutionApiFailure(attempt.status, attempt.data, attempt.rawText)
      throw new Error(`Evolution API recusou logout: ${details}`)
    }
    return
  }
  const details = formatEvolutionApiFailure(attempt.status, attempt.data, attempt.rawText)
  throw new Error(`Falha ao desligar sessão WhatsApp (${attempt.status}): ${details}`)
}

export async function deleteEvolutionInstance(instanceName: string): Promise<void> {
  const attempt = await evolutionRequest(
    'DELETE',
    `/instance/delete/${encodeURIComponent(instanceName)}`
  )
  if (attempt.ok) {
    const errFlag = attempt.data?.error
    if (errFlag === true || errFlag === 'true') {
      const details = formatEvolutionApiFailure(attempt.status, attempt.data, attempt.rawText)
      throw new Error(`Evolution API recusou remover instância: ${details}`)
    }
    return
  }
  const details = formatEvolutionApiFailure(attempt.status, attempt.data, attempt.rawText)
  throw new Error(`Falha ao remover instância (${attempt.status}): ${details}`)
}

export async function getEvolutionQrCode(instanceName: string): Promise<string | null> {
  const paths: Array<{ method: 'GET' | 'POST'; path: string; body?: EvolutionJson }> = [
    { method: 'GET', path: `/instance/connect/${encodeURIComponent(instanceName)}` },
    { method: 'GET', path: `/instance/qrcode/${encodeURIComponent(instanceName)}` },
    { method: 'POST', path: `/instance/connect/${encodeURIComponent(instanceName)}` },
  ]

  for (const entry of paths) {
    const res = await evolutionRequest(entry.method, entry.path, entry.body)
    if (!res.ok) continue
    const qr = extractQrCode(res.data)
    if (qr) return qr
  }
  return null
}

export async function sendEvolutionTextMessage(input: {
  instanceName: string
  to: string
  text: string
}): Promise<void> {
  const cfg = readEvolutionConfig()
  const url = `${cfg.baseUrl}/message/sendText/${encodeURIComponent(input.instanceName)}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.apiKey,
      },
      body: JSON.stringify({
        number: input.to,
        text: input.text,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const raw = await res.text().catch(() => '')
      throw new Error(`Evolution API falhou (${res.status}): ${raw.slice(0, 400)}`)
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timeout ao enviar mensagem na Evolution API.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
