import { useRef, useEffect, useCallback } from 'react'
import { CANVAS_WIDTH, CANVAS_HEIGHT, STROKE_COLOR, STROKE_WIDTH } from '../config.js'
import './DrawingCanvas.css'

function DrawingCanvas() {
  const canvasRef = useRef(null)
  const contextRef = useRef(null)
  const isDrawingRef = useRef(false)

  // Canvas mit fester Größe einrichten (HiDPI-fähig).
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1

    canvas.width = CANVAS_WIDTH * dpr
    canvas.height = CANVAS_HEIGHT * dpr

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    contextRef.current = ctx
  }, [])

  useEffect(() => {
    setupCanvas()
  }, [setupCanvas])

  const getPos = (event) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const point = event.touches ? event.touches[0] : event
    return {
      x: point.clientX - rect.left,
      y: point.clientY - rect.top,
    }
  }

  const startDrawing = (event) => {
    event.preventDefault()
    const ctx = contextRef.current
    const { x, y } = getPos(event)
    ctx.strokeStyle = STROKE_COLOR
    ctx.lineWidth = STROKE_WIDTH
    ctx.beginPath()
    ctx.moveTo(x, y)
    isDrawingRef.current = true
  }

  const draw = (event) => {
    if (!isDrawingRef.current) return
    event.preventDefault()
    const ctx = contextRef.current
    const { x, y } = getPos(event)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    if (!isDrawingRef.current) return
    contextRef.current.closePath()
    isDrawingRef.current = false
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = contextRef.current
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const downloadCanvas = () => {
    const canvas = canvasRef.current
    const link = document.createElement('a')
    link.download = 'zeichnung.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  return (
    <div className="drawing">
      <canvas
        ref={canvasRef}
        className="drawing__canvas"
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />

      <div className="drawing__actions">
        <button type="button" onClick={clearCanvas}>
          Löschen
        </button>
        <button type="button" onClick={downloadCanvas}>
          Speichern
        </button>
      </div>
    </div>
  )
}

export default DrawingCanvas
