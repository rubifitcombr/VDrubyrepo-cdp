'use client'

import { useEffect, useRef } from 'react'

type Options = {
  enabled: boolean
  onScan: (barcode: string) => void
  /** Mínimo de caracteres para considerar leitura (EAN-13 = 13). */
  minLength?: number
  /** Intervalo máximo entre teclas do leitor HID (ms). */
  maxInterKeyMs?: number
  /** Ignora quando o foco está em campos de texto (exceto `data-barcode-scan`). */
  ignoreWhenTyping?: boolean
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.closest('[data-barcode-scan="true"]')) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Captura leituras de leitor USB/HID (emula teclado + Enter).
 * Funciona em PDV e Garçom sem drivers extra.
 */
export function useBarcodeScanner({
  enabled,
  onScan,
  minLength = 8,
  maxInterKeyMs = 80,
  ignoreWhenTyping = true,
}: Options) {
  const bufferRef = useRef('')
  const lastKeyAtRef = useRef(0)
  const onScanRef = useRef(onScan)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    if (!enabled) return

    function flushBuffer() {
      const code = bufferRef.current.trim()
      bufferRef.current = ''
      if (code.length >= minLength) {
        onScanRef.current(code)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (ignoreWhenTyping && isTypingTarget(event.target)) return
      if (event.ctrlKey || event.metaKey || event.altKey) return

      const now = Date.now()
      if (lastKeyAtRef.current && now - lastKeyAtRef.current > maxInterKeyMs) {
        bufferRef.current = ''
      }
      lastKeyAtRef.current = now

      if (event.key === 'Enter') {
        if (bufferRef.current) {
          event.preventDefault()
          flushBuffer()
        }
        return
      }

      if (event.key.length !== 1) return
      if (!/[\dA-Za-z]/.test(event.key)) return

      bufferRef.current += event.key
      if (bufferRef.current.length > 32) {
        bufferRef.current = bufferRef.current.slice(-32)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [enabled, ignoreWhenTyping, maxInterKeyMs, minLength])
}
