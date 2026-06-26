'use client'

import {
  buildEscPosTicket,
  buildOrderTicketEscPos,
  type OrderTicketVariant,
} from '@/lib/print'
import { logPrintJob } from '@/lib/print/logger'
import type { StoreOrderRow } from '@/lib/store-order'
import type { StorePrintingState } from '@/lib/store-printing'

export type BluetoothPrintResult =
  | { ok: true; deviceName?: string }
  | { ok: false; code: string; message: string }

/**
 * Serviços/características GATT mais comuns em impressoras térmicas ESC/POS por BLE.
 * O navegador só permite ler serviços declarados em `optionalServices`; mantemos a
 * lista abrangente e, depois de ligar, procuramos uma característica com escrita.
 */
const KNOWN_PRINTER_SERVICES: BluetoothServiceUUID[] = [
  0x18f0,
  0xff00,
  0xffe0,
  0xff80,
  0xfee7,
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
]

/** Tamanho de bloco conservador: muitas térmicas BLE têm MTU pequeno. */
const WRITE_CHUNK_SIZE = 100
const WRITE_CHUNK_DELAY_MS = 18

const DEVICE_FLAG_KEY = 'vyria_print_bt_device'

type BluetoothWithGetDevices = Bluetooth & {
  getDevices?: () => Promise<BluetoothDevice[]>
}

type CachedPrinter = {
  device: BluetoothDevice
  characteristic: BluetoothRemoteGATTCharacteristic
}

let cached: CachedPrinter | null = null

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.bluetooth)
}

function rememberDevice(device: BluetoothDevice): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      DEVICE_FLAG_KEY,
      JSON.stringify({ id: device.id ?? null, name: device.name ?? null })
    )
  } catch {
    /* ignore */
  }
}

function readRememberedDevice(): { id: string | null; name: string | null } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DEVICE_FLAG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { id?: string | null; name?: string | null }
    return { id: parsed.id ?? null, name: parsed.name ?? null }
  } catch {
    return null
  }
}

export function forgetBluetoothPrinter(): void {
  try {
    cached?.device.gatt?.disconnect()
  } catch {
    /* ignore */
  }
  cached = null
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(DEVICE_FLAG_KEY)
  } catch {
    /* ignore */
  }
}

export function getBluetoothPrinterName(): string | null {
  if (cached?.device.name) return cached.device.name
  return readRememberedDevice()?.name ?? null
}

export function isBluetoothPrinterConnected(): boolean {
  return Boolean(cached?.device.gatt?.connected)
}

/**
 * Indica se vale a pena tentar imprimir por Bluetooth: há um aparelho ligado nesta
 * sessão ou ficou um aparelho memorizado e o navegador suporta Web Bluetooth.
 */
export function isBluetoothPrinterReady(): boolean {
  if (isBluetoothPrinterConnected()) return true
  return isWebBluetoothSupported() && readRememberedDevice() !== null
}

async function findWritableCharacteristic(
  device: BluetoothDevice
): Promise<BluetoothRemoteGATTCharacteristic> {
  const gatt = device.gatt
  if (!gatt) {
    throw new Error('Impressora sem GATT (não é uma térmica BLE compatível).')
  }
  const server = gatt.connected ? gatt : await gatt.connect()

  let services: BluetoothRemoteGATTService[] = []
  try {
    services = await server.getPrimaryServices()
  } catch {
    services = []
  }

  for (const service of services) {
    let chars: BluetoothRemoteGATTCharacteristic[] = []
    try {
      chars = await service.getCharacteristics()
    } catch {
      continue
    }
    for (const c of chars) {
      if (c.properties.write || c.properties.writeWithoutResponse) {
        return c
      }
    }
  }
  throw new Error(
    'Não encontrei como enviar dados para esta impressora Bluetooth (sem característica de escrita).'
  )
}

async function ensureConnection(): Promise<CachedPrinter> {
  if (cached?.device.gatt?.connected) return cached

  // Reconectar a um aparelho já ligado nesta sessão (GATT caiu).
  if (cached?.device) {
    const characteristic = await findWritableCharacteristic(cached.device)
    cached = { device: cached.device, characteristic }
    return cached
  }

  // Reabrir um aparelho memorizado de uma sessão anterior (sem novo gesto).
  const reconnected = await tryReconnectKnownBluetoothPrinter()
  if (reconnected && cached) return cached

  throw new Error(
    'Impressora Bluetooth não ligada. Carrega em «Ligar impressora Bluetooth» nesta janela primeiro.'
  )
}

async function writeEscPos(
  characteristic: BluetoothRemoteGATTCharacteristic,
  bytes: Uint8Array
): Promise<void> {
  const supportsNoResponse = characteristic.properties.writeWithoutResponse
  const canNoResponse =
    supportsNoResponse &&
    typeof characteristic.writeValueWithoutResponse === 'function'

  for (let i = 0; i < bytes.length; i += WRITE_CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + WRITE_CHUNK_SIZE)
    if (canNoResponse) {
      await characteristic.writeValueWithoutResponse(chunk)
    } else if (typeof characteristic.writeValue === 'function') {
      await characteristic.writeValue(chunk)
    } else {
      await characteristic.writeValueWithResponse(chunk)
    }
    await delay(WRITE_CHUNK_DELAY_MS)
  }
}

/**
 * Abre o seletor de dispositivos (precisa de gesto do utilizador), liga ao GATT e
 * memoriza o aparelho. Use em resposta a um clique.
 */
export async function connectBluetoothPrinter(): Promise<BluetoothPrintResult> {
  if (!isWebBluetoothSupported()) {
    return {
      ok: false,
      code: 'unsupported',
      message:
        'Este navegador não suporta impressão Bluetooth. Use Chrome ou Edge no Android, Windows ou Mac (no iPhone/Safari não funciona).',
    }
  }
  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: KNOWN_PRINTER_SERVICES,
    })
    const characteristic = await findWritableCharacteristic(device)
    cached = { device, characteristic }
    rememberDevice(device)
    try {
      device.addEventListener('gattserverdisconnected', () => {
        if (cached?.device === device) {
          cached = { device, characteristic: cached.characteristic }
        }
      })
    } catch {
      /* ignore */
    }
    return { ok: true, deviceName: device.name ?? undefined }
  } catch (e) {
    const err = e as DOMException
    if (err?.name === 'NotFoundError') {
      return {
        ok: false,
        code: 'cancelled',
        message: 'Nenhuma impressora escolhida.',
      }
    }
    return {
      ok: false,
      code: 'connect_failed',
      message: err?.message || 'Não foi possível ligar à impressora Bluetooth.',
    }
  }
}

/**
 * Tenta reabrir um aparelho já autorizado anteriormente (sem novo gesto), via
 * `navigator.bluetooth.getDevices()`. Disponível só em alguns navegadores.
 */
export async function tryReconnectKnownBluetoothPrinter(): Promise<boolean> {
  if (!isWebBluetoothSupported()) return false
  if (cached?.device.gatt?.connected) return true

  const remembered = readRememberedDevice()
  if (!remembered) return false

  const bt = navigator.bluetooth as BluetoothWithGetDevices
  if (typeof bt.getDevices !== 'function') return false

  try {
    const devices = await bt.getDevices()
    const match =
      devices.find((d) => remembered.id && d.id === remembered.id) ??
      devices.find((d) => remembered.name && d.name === remembered.name)
    if (!match) return false
    const characteristic = await findWritableCharacteristic(match)
    cached = { device: match, characteristic }
    return true
  } catch {
    return false
  }
}

export async function printEscPosViaBluetooth(
  bytes: Uint8Array
): Promise<BluetoothPrintResult> {
  if (!isWebBluetoothSupported()) {
    return {
      ok: false,
      code: 'unsupported',
      message:
        'Este navegador não suporta impressão Bluetooth. Use Chrome ou Edge no Android, Windows ou Mac.',
    }
  }
  try {
    const conn = await ensureConnection()
    await writeEscPos(conn.characteristic, bytes)
    logPrintJob({ phase: 'window_open', bytesLength: bytes.length })
    return { ok: true, deviceName: conn.device.name ?? undefined }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logPrintJob({ phase: 'error', detail: message })
    return { ok: false, code: 'print_failed', message }
  }
}

/** Cupom curto para validar a ligação Bluetooth. */
export async function printBluetoothTestTicket(
  storeName: string
): Promise<BluetoothPrintResult> {
  const lines = [
    storeName || 'Vyria',
    '------------------------------',
    'Cupom de teste - Bluetooth',
    new Date().toLocaleString('pt-BR'),
    '------------------------------',
    'Se imprimiu, esta tudo certo!',
    '',
  ].join('\n')
  return printEscPosViaBluetooth(buildEscPosTicket(lines))
}

export async function sendOrderTicketToBluetooth(opts: {
  storeName: string
  order: StoreOrderRow
  orderDisplayRef: string
  printing: Pick<
    StorePrintingState,
    'print_include_customer_details' | 'print_delivery_copy' | 'print_paper_mm'
  >
  variant?: OrderTicketVariant
}): Promise<BluetoothPrintResult> {
  let bytes: Uint8Array
  try {
    bytes = buildOrderTicketEscPos(opts)
  } catch (e) {
    return {
      ok: false,
      code: 'build_failed',
      message: e instanceof Error ? e.message : String(e),
    }
  }
  return printEscPosViaBluetooth(bytes)
}
