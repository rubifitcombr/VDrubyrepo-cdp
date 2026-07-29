'use client'

import { parseToledoP03Chunk, toledoP03PollCommand } from '@/lib/scale/toledo-p03'
import { roundWeightKg } from '@/lib/scale/price'
import type { ScaleReading } from '@/lib/scale/types'

const STABLE_REPEAT_COUNT = 3
const STABLE_EPSILON_KG = 0.002
const DEFAULT_POLL_MS = 250

export type ScaleClientStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'

export type ScaleConnectOptions = {
  baudRate?: number
  /** Envia comando de poll periódico (Toledo). */
  poll?: boolean
  pollIntervalMs?: number
}

type Listener = (reading: ScaleReading) => void
type StatusListener = (status: ScaleClientStatus, detail?: string) => void

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

/**
 * Cliente Web Serial para balança de checkout (Toledo P03 e compatíveis).
 * Uma instância por ecrã PDV; requer gesto do utilizador em `connect()`.
 */
export class VyriaScaleClient {
  private port: SerialPort | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private readLoopActive = false
  private textBuffer = ''
  private softwareTareKg = 0
  private recentWeights: number[] = []
  private listeners = new Set<Listener>()
  private statusListeners = new Set<StatusListener>()
  private status: ScaleClientStatus = 'disconnected'
  private lastReading: ScaleReading | null = null

  getStatus(): ScaleClientStatus {
    return this.status
  }

  getLastReading(): ScaleReading | null {
    return this.lastReading
  }

  getSoftwareTareKg(): number {
    return this.softwareTareKg
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    if (this.lastReading) listener(this.lastReading)
    return () => this.listeners.delete(listener)
  }

  subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => this.statusListeners.delete(listener)
  }

  private emitStatus(next: ScaleClientStatus, detail?: string) {
    this.status = next
    for (const fn of this.statusListeners) fn(next, detail)
  }

  private emitReading(reading: ScaleReading) {
    this.lastReading = reading
    for (const fn of this.listeners) fn(reading)
  }

  private withStability(parsed: ScaleReading): ScaleReading {
    const w = roundWeightKg(parsed.weightKg)
    this.recentWeights.push(w)
    if (this.recentWeights.length > STABLE_REPEAT_COUNT) {
      this.recentWeights.shift()
    }
    const stableByRepeat =
      this.recentWeights.length >= STABLE_REPEAT_COUNT &&
      this.recentWeights.every(
        (v) => Math.abs(v - w) <= STABLE_EPSILON_KG && v > 0
      )
    return {
      ...parsed,
      weightKg: w,
      stable: parsed.stable || stableByRepeat,
      tareKg: roundWeightKg(this.softwareTareKg),
    }
  }

  private ingestChunk(chunk: string) {
    this.textBuffer += chunk
    if (this.textBuffer.length > 512) {
      this.textBuffer = this.textBuffer.slice(-256)
    }

    const parts = this.textBuffer.split(/[\r\n]+/)
    this.textBuffer = parts.pop() ?? ''

    for (const part of parts) {
      const parsed = parseToledoP03Chunk(part, this.softwareTareKg)
      if (parsed) this.emitReading(this.withStability(parsed))
    }

    if (this.textBuffer.length > 4) {
      const parsed = parseToledoP03Chunk(this.textBuffer, this.softwareTareKg)
      if (parsed) this.emitReading(this.withStability(parsed))
    }
  }

  private async startReadLoop() {
    if (!this.port?.readable || this.readLoopActive) return
    this.readLoopActive = true
    while (this.port?.readable && this.readLoopActive) {
      try {
        this.reader = this.port.readable.getReader()
        while (this.readLoopActive) {
          const { value, done } = await this.reader.read()
          if (done) break
          if (value?.length) {
            this.ingestChunk(new TextDecoder('ascii').decode(value))
          }
        }
      } catch {
        if (this.readLoopActive) {
          this.emitStatus('error', 'Leitura da balança interrompida.')
        }
        break
      } finally {
        try {
          await this.reader?.cancel()
        } catch {
          /* ignore */
        }
        this.reader?.releaseLock()
        this.reader = null
      }
    }
    this.readLoopActive = false
  }

  private startPoll(pollIntervalMs: number) {
    this.stopPoll()
    if (!this.port?.writable) return
    this.pollTimer = setInterval(() => {
      void this.sendPoll()
    }, pollIntervalMs)
  }

  private stopPoll() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  private async sendPoll() {
    if (!this.port?.writable) return
    try {
      const writer = this.port.writable.getWriter()
      await writer.write(toledoP03PollCommand())
      writer.releaseLock()
    } catch {
      /* poll opcional */
    }
  }

  async connect(opts: ScaleConnectOptions = {}): Promise<void> {
    if (!isWebSerialSupported()) {
      this.emitStatus('error', 'Web Serial não disponível neste navegador.')
      throw new Error('Web Serial não disponível. Use Chrome ou Edge no computador.')
    }

    await this.disconnect()
    this.emitStatus('connecting')

    try {
      const port = await navigator.serial!.requestPort({ filters: [] })
      await port.open({
        baudRate: opts.baudRate ?? 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
      })
      this.port = port
      this.recentWeights = []
      this.textBuffer = ''
      this.emitStatus('connected')
      void this.startReadLoop()
      if (opts.poll !== false) {
        this.startPoll(opts.pollIntervalMs ?? DEFAULT_POLL_MS)
      }
    } catch (err) {
      this.emitStatus('error', err instanceof Error ? err.message : 'Falha ao ligar balança.')
      throw err
    }
  }

  async disconnect(): Promise<void> {
    this.readLoopActive = false
    this.stopPoll()
    try {
      await this.reader?.cancel()
    } catch {
      /* ignore */
    }
    this.reader = null
    if (this.port) {
      try {
        await this.port.close()
      } catch {
        /* ignore */
      }
    }
    this.port = null
    this.recentWeights = []
    this.textBuffer = ''
    this.lastReading = null
    this.emitStatus('disconnected')
  }

  /** Zera tara em software (desconta do peso líquido). */
  tare(): void {
    const base = this.lastReading?.weightKg ?? 0
    this.softwareTareKg = roundWeightKg(this.softwareTareKg + base)
    this.recentWeights = []
    if (this.lastReading) {
      this.emitReading({
        ...this.lastReading,
        weightKg: 0,
        stable: true,
        tareKg: this.softwareTareKg,
      })
    }
  }

  resetTare(): void {
    this.softwareTareKg = 0
    this.recentWeights = []
  }
}

let sharedClient: VyriaScaleClient | null = null

/** Instância partilhada no PDV (evita múltiplas portas abertas). */
export function getSharedScaleClient(): VyriaScaleClient {
  if (!sharedClient) sharedClient = new VyriaScaleClient()
  return sharedClient
}
