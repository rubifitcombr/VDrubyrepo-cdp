/** Tipos mínimos Web Serial API (Chrome/Edge) — balança no PDV. */

interface SerialPort {
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
  open(options: SerialOptions): Promise<void>
  close(): Promise<void>
}

interface SerialOptions {
  baudRate: number
  dataBits?: 7 | 8
  stopBits?: 1 | 2
  parity?: 'none' | 'even' | 'odd'
  flowControl?: 'none' | 'hardware'
}

interface Serial extends EventTarget {
  requestPort(options?: { filters: SerialPortFilter[] }): Promise<SerialPort>
  getPorts(): Promise<SerialPort[]>
}

interface SerialPortFilter {
  usbVendorId?: number
  usbProductId?: number
}

interface Navigator {
  readonly serial?: Serial
}
