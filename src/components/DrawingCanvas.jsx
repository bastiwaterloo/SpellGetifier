import { useRef, useEffect, useState, useCallback } from 'react'
import './DrawingCanvas.css'

const COLORS = ['#ffffff', '#7f5af0', '#2cb67d', '#ff6b6b', '#ffd166', '#ffffff00']

function DrawingCanvas() {
  const canvasRef = useRef(null)
  const contextRef = useRef(null)
  const isDrawingRef = useRef(false)

  const [color, setColor] = useState('#ffffff')
  const [lineWidth, setLineWidth] = useState(4)

  // Canvas an die angezeigte Größe anpassen, ohne den Inhalt zu verlieren.
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    const snapshot = canvas.toDataURL()

    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    contextRef.current = ctx

    const img = new Image()
    img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
    img.src = snapshot
  }, [])

  useEffect(() => {
    setupCanvas()
    window.addEventListener('resize', setupCanvas)
    return () => window.removeEventListener('resize', setupCanvas)
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
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
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
      <div className="drawing__toolbar">
        <div className="drawing__colors">
          {COLORS.slice(0, 5).map((c) => (
            <button
              key={c}
              type="button"
              className={`drawing__swatch${color === c ? ' is-active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Farbe ${c}`}
            />
          ))}
        </div>

        <label className="drawing__size">
          Stärke: {lineWidth}px
          <input
            type="range"
            min="1"
            max="40"
            value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
          />
        </label>

        <div className="drawing__actions">
          <button type="button" onClick={clearCanvas}>
            Löschen
          </button>
          <button type="button" onClick={downloadCanvas}>
            Speichern
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="drawing__canvas"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
    </div>
  )
}

export default DrawingCanvas
