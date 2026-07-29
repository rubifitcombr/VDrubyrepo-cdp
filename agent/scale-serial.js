/* eslint-disable @typescript-eslint/no-require-imports */
/** Balança serial no Vyria Print Agent (Node + serialport). */

const { parseToledoP03Chunk, toledoP03PollCommand, roundWeightKg } = require('./scale-toledo')

const STABLE_REPEAT_COUNT = 3
const STABLE_EPSILON_KG = 0.002
const DEFAULT_POLL_MS = 250

let serialPortModule = null
let port = null
let pollTimer = null
let textBuffer = ''
let softwareTareKg = 0
let recentWeights = []
let savedConfig = {
  path: String(process.env.SCALE_SERIAL_PATH || process.env.SCALE_PORT_PATH || '').trim(),
  baudRate: Number.parseInt(String(process.env.SCALE_BAUD_RATE || '9600'), 10) || 9600,
  protocol: String(process.env.SCALE_PROTOCOL || 'toledo_p03').trim() || 'toledo_p03',
}

let lastReading = {
  weightKg: 0,
  stable: false,
  tareKg: 0,
  raw: null,
  timestamp: null,
}

function loadSerialPort() {
  if (serialPortModule) return serialPortModule
  try {
    serialPortModule = require('serialport')
    return serialPortModule
  } catch {
    return null
  }
}

function withStability(parsed) {
  const w = roundWeightKg(parsed.weightKg)
  recentWeights.push(w)
  if (recentWeights.length > STABLE_REPEAT_COUNT) recentWeights.shift()
  const stableByRepeat =
    recentWeights.length >= STABLE_REPEAT_COUNT &&
    recentWeights.every((v) => Math.abs(v - w) <= STABLE_EPSILON_KG && v > 0)
  return {
    ...parsed,
    weightKg: w,
    stable: parsed.stable || stableByRepeat,
    tareKg: roundWeightKg(softwareTareKg),
    timestamp: new Date().toISOString(),
  }
}

function ingestChunk(chunk) {
  textBuffer += chunk
  if (textBuffer.length > 512) textBuffer = textBuffer.slice(-256)

  const parts = textBuffer.split(/[\r\n]+/)
  textBuffer = parts.pop() ?? ''

  for (const part of parts) {
    const parsed = parseToledoP03Chunk(part, softwareTareKg)
    if (parsed) lastReading = withStability(parsed)
  }

  if (textBuffer.length > 4) {
    const parsed = parseToledoP03Chunk(textBuffer, softwareTareKg)
    if (parsed) lastReading = withStability(parsed)
  }
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function startPoll() {
  stopPoll()
  if (!port?.isOpen) return
  pollTimer = setInterval(() => {
    try {
      if (port?.isOpen) port.write(toledoP03PollCommand())
    } catch {
      /* poll opcional */
    }
  }, DEFAULT_POLL_MS)
}

function closePort() {
  stopPoll()
  return new Promise((resolve) => {
    if (!port) {
      resolve()
      return
    }
    const p = port
    port = null
    if (p.isOpen) {
      p.close(() => resolve())
    } else {
      resolve()
    }
  })
}

async function openPort(path, baudRate) {
  const mod = loadSerialPort()
  if (!mod?.SerialPort) {
    throw new Error(
      'Pacote serialport não instalado. Na pasta agent/, execute: npm install'
    )
  }

  const serialPath = String(path || '').trim()
  if (!serialPath) {
    throw new Error(
      'Porta serial não configurada. Defina SCALE_SERIAL_PATH no agente ou POST /scale/configure.'
    )
  }

  await closePort()
  textBuffer = ''
  recentWeights = []

  const SerialPort = mod.SerialPort
  port = new SerialPort({
    path: serialPath,
    baudRate: baudRate || 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    autoOpen: false,
  })

  await new Promise((resolve, reject) => {
    port.open((err) => (err ? reject(err) : resolve()))
  })

  port.on('data', (buf) => {
    ingestChunk(buf.toString('ascii'))
  })

  port.on('error', () => {
    /* leitura falha — GET /scale/weight reporta disconnected */
  })

  port.on('close', () => {
    stopPoll()
  })

  savedConfig = { ...savedConfig, path: serialPath, baudRate: baudRate || 9600 }
  startPoll()
}

async function ensureOpen() {
  if (port?.isOpen) return true
  if (!savedConfig.path) return false
  await openPort(savedConfig.path, savedConfig.baudRate)
  return true
}

async function listPorts() {
  const mod = loadSerialPort()
  if (!mod?.SerialPort) return []
  const ports = await mod.SerialPort.list()
  return ports.map((p) => ({
    path: p.path,
    manufacturer: p.manufacturer || null,
    serialNumber: p.serialNumber || null,
    vendorId: p.vendorId || null,
    productId: p.productId || null,
  }))
}

function configure({ path, baudRate, protocol } = {}) {
  if (path != null) savedConfig.path = String(path).trim()
  if (baudRate != null) {
    const n = Number.parseInt(String(baudRate), 10)
    if ([2400, 4800, 9600, 19200].includes(n)) savedConfig.baudRate = n
  }
  if (protocol != null) savedConfig.protocol = String(protocol).trim() || 'toledo_p03'
  return { ...savedConfig }
}

function getStatus() {
  return {
    connected: Boolean(port?.isOpen),
    path: savedConfig.path || null,
    baudRate: savedConfig.baudRate,
    protocol: savedConfig.protocol,
    serialportAvailable: Boolean(loadSerialPort()?.SerialPort),
    tareKg: roundWeightKg(softwareTareKg),
  }
}

function getReading() {
  return {
    ok: true,
    weightKg: lastReading.weightKg,
    stable: lastReading.stable,
    tareKg: roundWeightKg(softwareTareKg),
    timestamp: lastReading.timestamp || new Date().toISOString(),
    raw: lastReading.raw,
  }
}

function tare() {
  const base = lastReading.weightKg || 0
  softwareTareKg = roundWeightKg(softwareTareKg + base)
  recentWeights = []
  lastReading = {
    weightKg: 0,
    stable: true,
    tareKg: roundWeightKg(softwareTareKg),
    raw: lastReading.raw,
    timestamp: new Date().toISOString(),
  }
  return getReading()
}

function resetTare() {
  softwareTareKg = 0
  recentWeights = []
}

module.exports = {
  listPorts,
  configure,
  openPort,
  closePort,
  ensureOpen,
  getStatus,
  getReading,
  tare,
  resetTare,
}
