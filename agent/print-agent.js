// agent/print-agent.js
/* eslint-disable @typescript-eslint/no-require-imports */
// Roda na loja: node print-agent.js
// Requer: npm install

const express = require('express')
const net = require('net')
const os = require('os')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const agentToken = process.env.AGENT_TOKEN || 'vyria-agent-2026'
const DEFAULT_PRINTER_PORT = 9100

function normalizePort(raw, fallback = DEFAULT_PRINTER_PORT) {
  return Math.min(
    65535,
    Math.max(1, Number.parseInt(String(raw || fallback), 10) || fallback)
  )
}

function normalizeSocketError(err, host, port) {
  const code = String(err?.code || '')
  if (code === 'ECONNREFUSED') {
    return {
      code: 'printer_connection_refused',
      error: `Conexão recusada em ${host}:${port}. Confirma se a porta está correta.`,
      detail: code,
    }
  }
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return {
      code: 'printer_offline',
      error: `Host inalcançável: ${host}. Confirma IP, Wi-Fi e rede local.`,
      detail: code,
    }
  }
  return {
    code: 'printer_offline',
    error: err?.message || `Não foi possível conectar em ${host}:${port}.`,
    detail: code || String(err || ''),
  }
}

/** Prefixos tipo 192.168.1. a partir das IPv4 locais (não loopback). */
function localSubnetPrefixes() {
  const ifaces = os.networkInterfaces()
  const prefixes = new Set()
  for (const name of Object.keys(ifaces)) {
    for (const addr of ifaces[name] || []) {
      if ((addr.family !== 'IPv4' && addr.family !== 4) || addr.internal) continue
      const parts = String(addr.address).split('.')
      if (parts.length !== 4) continue
      prefixes.add(`${parts[0]}.${parts[1]}.${parts[2]}.`)
    }
  }
  return [...prefixes]
}

function probeTcpPort(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.destroy()
      resolve({ ok: true, ip: host, port })
    })
    socket.setTimeout(timeoutMs)
    socket.on('timeout', () => {
      socket.destroy()
      resolve({ ok: false, ip: host, port, code: 'printer_timeout' })
    })
    socket.on('error', (err) => resolve({ ok: false, ip: host, port, ...normalizeSocketError(err, host, port) }))
  })
}

/** Varre /24 à procura de porta aberta (ex. 9100 ESC/POS). */
async function scanSubnetForPort(prefix, port, timeoutMs, concurrency) {
  const ips = []
  for (let i = 1; i <= 254; i += 1) {
    ips.push(`${prefix}${i}`)
  }
  const found = []
  for (let i = 0; i < ips.length; i += concurrency) {
    const chunk = ips.slice(i, i + concurrency)
    const results = await Promise.all(chunk.map((ip) => probeTcpPort(ip, port, timeoutMs)))
    for (const r of results) {
      if (r?.ok) found.push({ ip: r.ip, port: r.port, status: 'open', model: null })
    }
  }
  return found
}

app.get('/health', (req, res) => {
  const printerIp = String(req.query.printerIp || '').trim()
  const printerPort = normalizePort(req.query.printerPort)

  if (!printerIp) {
    return res.json({
      ok: true,
      version: '1.2.0',
      agent: 'vyria-print-agent',
      printer: null,
    })
  }

  const token = req.headers['x-agent-token']
  if (token !== agentToken) {
    return res.status(401).json({ ok: false, code: 'unauthorized', error: 'unauthorized' })
  }

  probeTcpPort(printerIp, printerPort, 3000).then((printer) => {
    if (printer.ok) {
      res.json({
        ok: true,
        version: '1.2.0',
        agent: 'vyria-print-agent',
        printer: { ok: true, ip: printerIp, port: printerPort },
      })
    } else {
      res.status(printer.code === 'printer_timeout' ? 504 : 502).json({
        ok: false,
        version: '1.2.0',
        agent: 'vyria-print-agent',
        printer: { ok: false, ip: printerIp, port: printerPort },
        code: printer.code,
        error: printer.error || `Impressora não respondeu em ${printerIp}:${printerPort}.`,
        detail: printer.detail,
      })
    }
  })
})

/**
 * Procura dispositivos com porta TCP aberta (térmicas ESC/POS costumam usar 9100).
 * Corre **no aparelho onde o agente está** (mesma Wi-Fi que a impressora).
 * Autenticação: header x-agent-token (igual ao /print).
 */
app.get('/discover-printers', async (req, res) => {
  const token = req.headers['x-agent-token']
  if (token !== agentToken) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const port = normalizePort(req.query.port)
  const timeoutMs = Math.min(2000, Math.max(80, Number.parseInt(String(req.query.timeoutMs || '240'), 10) || 240))
  const concurrency = Math.min(96, Math.max(8, Number.parseInt(String(req.query.concurrency || '56'), 10) || 56))
  try {
    const prefixes = localSubnetPrefixes()
    if (prefixes.length === 0) {
      return res.json({ ok: true, port, printers: [], hint: 'no-local-ipv4' })
    }
    const merged = new Set()
    const printers = []
    for (const prefix of prefixes) {
      const found = await scanSubnetForPort(prefix, port, timeoutMs, concurrency)
      found.forEach((printer) => {
        const key = `${printer.ip}:${printer.port}`
        if (merged.has(key)) return
        merged.add(key)
        printers.push(printer)
      })
    }
    printers.sort((a, b) =>
      a.ip.localeCompare(b.ip, undefined, { numeric: true })
    )
    res.json({ ok: true, port, printers })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

function writeToPrinter({ printerIp, printerPort, buffer, timeoutMs = 5000 }) {
  return new Promise((resolve) => {
    const client = new net.Socket()
    let responded = false
    const done = (result) => {
      if (responded) return
      responded = true
      clearTimeout(timeout)
      client.destroy()
      resolve(result)
    }
    const timeout = setTimeout(() => {
      done({
        ok: false,
        code: 'printer_timeout',
        error: `Impressora não respondeu em ${Math.round(timeoutMs / 1000)}s (${printerIp}:${printerPort}).`,
      })
    }, timeoutMs)

    client.connect(printerPort, printerIp, () => {
      client.write(buffer, () => {
        client.end()
        done({ ok: true })
      })
    })

    client.on('error', (err) => {
      done({ ok: false, ...normalizeSocketError(err, printerIp, printerPort) })
    })
  })
}

app.post('/test-printer', async (req, res) => {
  const token = req.headers['x-agent-token']
  if (token !== agentToken) {
    return res.status(401).json({ ok: false, code: 'unauthorized', error: 'unauthorized' })
  }

  const { printerIp } = req.body
  const printerPort = normalizePort(req.body?.printerPort)
  if (!printerIp) {
    return res.status(400).json({ ok: false, code: 'bad_request', error: 'printerIp é obrigatório' })
  }

  // ESC @ + feed + corte parcial. Serve para validar TCP/ESC-POS sem depender de texto.
  const buffer = Buffer.from([0x1b, 0x40, 0x1b, 0x64, 0x01, 0x1d, 0x56, 0x42, 0x00])
  const result = await writeToPrinter({ printerIp, printerPort, buffer, timeoutMs: 3000 })
  if (!result.ok) {
    const status = result.code === 'printer_timeout' ? 504 : 502
    return res.status(status).json(result)
  }
  res.json({ ok: true, printerIp, printerPort })
})

app.post('/print', async (req, res) => {
  const token = req.headers['x-agent-token']
  if (token !== agentToken) {
    return res.status(401).json({ ok: false, code: 'unauthorized', error: 'unauthorized' })
  }

  const { printerIp, data } = req.body
  const printerPort = normalizePort(req.body?.printerPort)

  if (!printerIp || !data) {
    return res
      .status(400)
      .json({ ok: false, code: 'bad_request', error: 'printerIp e data são obrigatórios' })
  }

  const buffer = Buffer.from(data, 'base64')
  const result = await writeToPrinter({ printerIp, printerPort, buffer, timeoutMs: 5000 })
  if (!result.ok) {
    const status = result.code === 'printer_timeout' ? 504 : 502
    return res.status(status).json(result)
  }
  res.json({ ok: true, printerIp, printerPort })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Vyria Print Agent rodando na porta ${PORT}`)
})
