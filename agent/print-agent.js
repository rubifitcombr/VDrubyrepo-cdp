// agent/print-agent.js
// Roda na loja: node print-agent.js
// Requer: npm install

const express = require('express')
const net = require('net')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const agentToken = process.env.AGENT_TOKEN || 'vyria-agent-2026'

app.get('/health', (req, res) => {
  res.json({ ok: true, version: '1.0.0', agent: 'vyria-print-agent' })
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
