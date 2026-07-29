import { roundWeightKg } from '@/lib/scale/price'
import type { ScaleReading } from '@/lib/scale/types'

const STX = 0x02
const ETX = 0x03

/**
 * Parser Toledo P03 / envio contínuo RS-232.
 * Aceita frames STX…ETX ou linhas ASCII com peso em kg (ex.: `ST,GS,+001.234kg`).
 */
export function parseToledoP03Chunk(
  buffer: Uint8Array | string,
  tareKg = 0
): ScaleReading | null {
  const text =
    typeof buffer === 'string'
      ? buffer
      : new TextDecoder('ascii').decode(buffer)

  const framed = text.match(/\x02([^\x03]*)\x03/)
  const payload = framed?.[1] ?? text

  const match = payload.match(/([+-]?\d+[.,]\d+)\s*(?:kg|KG)?/i)
  if (!match?.[1]) return null

  const rawWeight = Number.parseFloat(match[1].replace(',', '.'))
  if (!Number.isFinite(rawWeight)) return null

  const netKg = roundWeightKg(Math.max(0, rawWeight - tareKg))
  const stable = /ST\b|STABLE/i.test(payload) || /GS\b/.test(payload)

  return {
    weightKg: netKg,
    stable,
    tareKg: roundWeightKg(tareKg),
    raw: payload.trim().slice(0, 120),
  }
}

/** Empacota comando de solicitação de peso (poll) — comum em balanças Toledo. */
export function toledoP03PollCommand(): Uint8Array {
  return new Uint8Array([STX, 0x57, ETX]) // W
}
