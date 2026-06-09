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
      resolve(true)
    })
    socket.setTimeout(timeoutMs)
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => resolve(false))
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
    const results = await Promise.all(
      chunk.map((ip) => probeTcpPort(ip, port, timeoutMs).then((ok) => (ok ? ip : null)))
    )
    for (const r of results) {
      if (r) found.push(r)
    }
  }
  return found
}

app.get('/health', (req, res) => {
  res.json({ ok: true, version: '1.1.0', agent: 'vyria-print-agent' })
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
  const port = Math.min(
    65535,
    Math.max(1, Number.parseInt(String(req.query.port || '9100'), 10) || 9100)
  )
  try {
    const prefixes = localSubnetPrefixes()
    if (prefixes.length === 0) {
      return res.json({ ok: true, port, printers: [], hint: 'no-local-ipv4' })
    }
    const merged = new Set()
    for (const prefix of prefixes) {
      const ips = await scanSubnetForPort(prefix, port, 240, 56)
      ips.forEach((ip) => merged.add(ip))
    }
    const printers = [...merged].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    )
    res.json({ ok: true, port, printers })
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) })
  }
})

app.post('/print', (req, res) => {
  const token = req.headers['x-agent-token']
  if (token !== agentToken) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const { printerIp, printerPort = 9100, data } = req.body

  if (!printerIp || !data) {
    return res
      .status(400)
      .json({ error: 'printerIp e data são obrigatórios' })
  }

  const buffer = Buffer.from(data, 'base64')
  const client = new net.Socket()
  let responded = false

  const timeout = setTimeout(() => {
    if (!responded) {
      responded = true
      client.destroy()
      res.status(504).json({ error: 'timeout ao conectar na impressora' })
    }
  }, 5000)

  client.connect(printerPort, printerIp, () => {
    client.write(buffer, () => {
      client.end()
      if (!responded) {
        responded = true
        clearTimeout(timeout)
        res.json({ ok: true })
      }
    })
  })

  client.on('error', (err) => {
    if (!responded) {
      responded = true
      clearTimeout(timeout)
      res.status(500).json({ error: err.message })
    }
  })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Vyria Print Agent rodando na porta ${PORT}`)
})
