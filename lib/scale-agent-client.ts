'use client'

import type { ScaleReading } from '@/lib/scale/types'

export type ScaleAgentClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; code?: string }

export type ScaleAgentWeightPayload = ScaleReading & {
  timestamp: string
}

export type ScaleAgentStatusPayload = {
  connected: boolean
  path: string | null
  baudRate: number
  protocol: string
  serialportAvailable: boolean
  tareKg: number
}

type AgentJson = {
  ok?: boolean
  error?: string
  code?: string
  weightKg?: number
  stable?: boolean
  tareKg?: number
  timestamp?: string
  connected?: boolean
  path?: string | null
  baudRate?: number
  protocol?: string
  serialportAvailable?: boolean
}

export function normalizeAgentBase(url: string): string | null {
  const base = String(url || '').trim().replace(/\/+$/, '')
  if (!base || !/^https?:\/\//i.test(base)) return null
  return base
}

function agentHeaders(token: string): HeadersInit {
  return {
    Accept: 'application/json',
    'x-agent-token': token.trim() || 'vyria-agent-2026',
  }
}

async function parseAgentJson(res: Response): Promise<AgentJson> {
  try {
    return (await res.json()) as AgentJson
  } catch {
    return {}
  }
}

export async function fetchScalePortsFromAgent(
  agentUrl: string,
  agentToken: string
): Promise<
  ScaleAgentClientResult<
    Array<{
      path: string
      manufacturer?: string | null
    }>
  >
> {
  const base = normalizeAgentBase(agentUrl)
  if (!base) {
    return { ok: false, code: 'agent_not_configured', message: 'URL do Print Agent inválida.' }
  }

  try {
    const res = await fetch(`${base}/scale/ports`, {
      method: 'GET',
      headers: agentHeaders(agentToken),
    })
    const json = (await parseAgentJson(res)) as AgentJson & {
      ports?: Array<{ path?: string; manufacturer?: string | null }>
    }
    if (!res.ok || json.ok === false) {
      return {
        ok: false,
        code: json.code || `http_${res.status}`,
        message: json.error || 'Não foi possível listar portas seriais no Print Agent.',
      }
    }
    const ports = Array.isArray(json.ports)
      ? json.ports
          .map((port) => ({
            path: String(port.path ?? '').trim(),
            manufacturer: port.manufacturer ?? null,
          }))
          .filter((port) => port.path)
      : []
    return { ok: true, data: ports }
  } catch (error) {
    return {
      ok: false,
      code: 'agent_offline',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function postScaleConfigureToAgent(
  agentUrl: string,
  agentToken: string,
  config: { path?: string; baudRate?: number; protocol?: string }
): Promise<ScaleAgentClientResult<ScaleAgentStatusPayload>> {
  const base = normalizeAgentBase(agentUrl)
  if (!base) {
    return { ok: false, code: 'agent_not_configured', message: 'URL do Print Agent inválida.' }
  }

  try {
    const res = await fetch(`${base}/scale/configure`, {
      method: 'POST',
      headers: {
        ...agentHeaders(agentToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    })
    const json = await parseAgentJson(res)
    if (!res.ok || json.ok === false) {
      return {
        ok: false,
        code: json.code || `http_${res.status}`,
        message: json.error || 'Não foi possível configurar a balança no Print Agent.',
      }
    }
    return {
      ok: true,
      data: {
        connected: json.connected === true,
        path: json.path ?? null,
        baudRate: Number(json.baudRate) || config.baudRate || 9600,
        protocol: String(json.protocol || config.protocol || 'toledo_p03'),
        serialportAvailable: json.serialportAvailable === true,
        tareKg: Number(json.tareKg) || 0,
      },
    }
  } catch (error) {
    return {
      ok: false,
      code: 'agent_offline',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function fetchScaleWeightFromAgent(
  agentUrl: string,
  agentToken: string,
  opts?: { timeoutMs?: number }
): Promise<ScaleAgentClientResult<ScaleAgentWeightPayload>> {
  const base = normalizeAgentBase(agentUrl)
  if (!base) {
    return { ok: false, code: 'agent_not_configured', message: 'URL do Print Agent inválida.' }
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), opts?.timeoutMs ?? 4000)

  try {
    const res = await fetch(`${base}/scale/weight`, {
      method: 'GET',
      headers: agentHeaders(agentToken),
      signal: controller.signal,
    })
    const json = await parseAgentJson(res)
    if (!res.ok || json.ok === false) {
      return {
        ok: false,
        code: json.code || `http_${res.status}`,
        message: json.error || 'Não foi possível ler o peso no Print Agent.',
      }
    }

    const weightKg = Number(json.weightKg)
    if (!Number.isFinite(weightKg)) {
      return { ok: false, code: 'invalid_payload', message: 'Resposta inválida do Print Agent.' }
    }

    return {
      ok: true,
      data: {
        weightKg,
        stable: json.stable === true,
        tareKg: Number(json.tareKg) || 0,
        timestamp: String(json.timestamp || new Date().toISOString()),
      },
    }
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === 'AbortError'
        ? 'Tempo esgotado ao contactar o Print Agent.'
        : error instanceof TypeError
          ? 'Não foi possível contactar o Print Agent. Confere URL, rede local e se o agente está a correr.'
          : error instanceof Error
            ? error.message
            : String(error)
    return { ok: false, code: 'agent_offline', message }
  } finally {
    window.clearTimeout(timer)
  }
}

export async function postScaleTareToAgent(
  agentUrl: string,
  agentToken: string
): Promise<ScaleAgentClientResult<ScaleAgentWeightPayload>> {
  const base = normalizeAgentBase(agentUrl)
  if (!base) {
    return { ok: false, code: 'agent_not_configured', message: 'URL do Print Agent inválida.' }
  }

  try {
    const res = await fetch(`${base}/scale/tare`, {
      method: 'POST',
      headers: {
        ...agentHeaders(agentToken),
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    const json = await parseAgentJson(res)
    if (!res.ok || json.ok === false) {
      return {
        ok: false,
        code: json.code || `http_${res.status}`,
        message: json.error || 'Não foi possível zerar a tara no Print Agent.',
      }
    }
    return {
      ok: true,
      data: {
        weightKg: Number(json.weightKg) || 0,
        stable: true,
        tareKg: Number(json.tareKg) || 0,
        timestamp: String(json.timestamp || new Date().toISOString()),
      },
    }
  } catch (error) {
    return {
      ok: false,
      code: 'agent_offline',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function fetchScaleStatusFromAgent(
  agentUrl: string,
  agentToken: string
): Promise<ScaleAgentClientResult<ScaleAgentStatusPayload>> {
  const base = normalizeAgentBase(agentUrl)
  if (!base) {
    return { ok: false, code: 'agent_not_configured', message: 'URL do Print Agent inválida.' }
  }

  try {
    const res = await fetch(`${base}/scale/status`, {
      method: 'GET',
      headers: agentHeaders(agentToken),
    })
    const json = await parseAgentJson(res)
    if (!res.ok || json.ok === false) {
      return {
        ok: false,
        code: json.code || `http_${res.status}`,
        message: json.error || 'Não foi possível obter o estado da balança.',
      }
    }
    return {
      ok: true,
      data: {
        connected: json.connected === true,
        path: json.path ?? null,
        baudRate: Number(json.baudRate) || 9600,
        protocol: String(json.protocol || 'toledo_p03'),
        serialportAvailable: json.serialportAvailable === true,
        tareKg: Number(json.tareKg) || 0,
      },
    }
  } catch (error) {
    return {
      ok: false,
      code: 'agent_offline',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
