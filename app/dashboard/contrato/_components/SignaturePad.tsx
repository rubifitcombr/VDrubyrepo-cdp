'use client'

import { useEffect, useRef, useState } from 'react'

type Point = { x: number; y: number }

function getPoint(canvas: HTMLCanvasElement, e: React.PointerEvent<HTMLCanvasElement>): Point {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  }
}

export function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string | null, hasInk: boolean) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const lastPoint = useRef<Point | null>(null)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#1a1614'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function emitChange() {
    const canvas = canvasRef.current
    if (!canvas) return
    onChange(hasInk ? canvas.toDataURL('image/png') : null, hasInk)
  }

  function drawLine(from: Point, to: Point) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    drawing.current = true
    lastPoint.current = getPoint(canvas, e)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const canvas = canvasRef.current
    if (!canvas || !lastPoint.current) return
    const next = getPoint(canvas, e)
    drawLine(lastPoint.current, next)
    lastPoint.current = next
    if (!hasInk) {
      setHasInk(true)
      onChange(canvas.toDataURL('image/png'), true)
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (canvas) {
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    drawing.current = false
    lastPoint.current = null
    emitChange()
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange(null, false)
  }

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-[var(--card-border)] bg-white">
        <canvas
          ref={canvasRef}
          width={640}
          height={180}
          className="h-44 w-full touch-none cursor-crosshair"
          aria-label="Área de assinatura electrónica"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-[#6b7280]">Desenhe a sua assinatura com o rato ou o dedo.</p>
        <button
          type="button"
          onClick={clear}
          className="text-xs font-semibold text-[var(--dash-primary)] hover:underline"
        >
          Limpar assinatura
        </button>
      </div>
    </div>
  )
}
