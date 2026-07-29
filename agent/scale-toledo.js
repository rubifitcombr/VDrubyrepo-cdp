/** Parser Toledo P03 / envio contínuo RS-232 (espelho de lib/scale/toledo-p03.ts). */

const STX = 0x02
const ETX = 0x03

function roundWeightKg(n) {
  return Math.round(n * 10000) / 10000
}

function parseToledoP03Chunk(buffer, tareKg = 0) {
  const text = typeof buffer === 'string' ? buffer : String(buffer || '')
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

function toledoP03PollCommand() {
  return Buffer.from([STX, 0x57, ETX])
}

module.exports = { parseToledoP03Chunk, toledoP03PollCommand, roundWeightKg }
