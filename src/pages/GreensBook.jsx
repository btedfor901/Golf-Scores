import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const ARROW_COLORS = {
  red: '#ef4444',
  blue: '#3b82f6',
  yellow: '#eab308',
  white: '#ffffff',
}

function drawArrow(ctx, x1, y1, x2, y2, color) {
  const dx = x2 - x1, dy = y2 - y1
  if (Math.hypot(dx, dy) < 10) return
  const angle = Math.atan2(dy, dx)
  const headLen = 14
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 4
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
  ctx.shadowBlur = 0
}

function redrawCanvas(canvas, annotations, tempArrow) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const W = canvas.width, H = canvas.height
  annotations.forEach(a => {
    if (a.type === 'arrow') {
      drawArrow(ctx, a.x1 * W, a.y1 * H, a.x2 * W, a.y2 * H, a.color)
    } else if (a.type === 'note') {
      ctx.font = 'bold 13px sans-serif'
      ctx.fillStyle = '#000'
      ctx.fillText(a.text, a.x * W + 1, a.y * H + 1)
      ctx.fillStyle = a.color || '#fff'
      ctx.fillText(a.text, a.x * W, a.y * H)
    }
  })
  if (tempArrow) {
    drawArrow(ctx, tempArrow.x1, tempArrow.y1, tempArrow.x2, tempArrow.y2, tempArrow.color)
  }
}

export default function GreensBook() {
  const { player } = useAuth()
  const canAdmin = player?.is_commissioner

  const [courses, setCourses] = useState([])
  const [courseId, setCourseId] = useState(null)
  const [hole, setHole] = useState(1)
  const [greenData, setGreenData] = useState(null)
  const [annotations, setAnnotations] = useState([])
  const [notes, setNotes] = useState('')
  const [mode, setMode] = useState('view')
  const [arrowColor, setArrowColor] = useState('red')
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState(null)
  const [mapsReady, setMapsReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [gpsPos, setGpsPos] = useState(null)

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const canvasRef = useRef(null)
  const annotationsRef = useRef([])

  // Load Google Maps script
  useEffect(() => {
    if (window.google?.maps) { setMapsReady(true); return }
    window.__greensBookReady = () => setMapsReady(true)
    if (!document.getElementById('gmap-script')) {
      const s = document.createElement('script')
      s.id = 'gmap-script'
      s.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&callback=__greensBookReady&v=weekly`
      s.async = true
      document.head.appendChild(s)
    }
    return () => { delete window.__greensBookReady }
  }, [])

  // Load courses
  useEffect(() => {
    supabase.from('courses').select('id, name').then(({ data }) => {
      if (data?.length) {
        setCourses(data)
        const aud = data.find(c => c.name.toLowerCase().includes('audubon'))
        setCourseId(aud?.id ?? data[0].id)
      }
    })
  }, [])

  // Load green data for current hole
  const loadGreen = useCallback(async () => {
    if (!courseId) return
    const { data } = await supabase
      .from('green_annotations')
      .select('*')
      .eq('course_id', courseId)
      .eq('hole_number', hole)
      .maybeSingle()
    setGreenData(data)
    const ann = data?.annotations ?? []
    setAnnotations(ann)
    annotationsRef.current = ann
    setNotes(data?.notes ?? '')
  }, [courseId, hole])

  useEffect(() => { loadGreen() }, [loadGreen])

  // Init / update map
  useEffect(() => {
    if (!mapsReady || !mapContainerRef.current) return
    const center = greenData?.center_lat
      ? { lat: greenData.center_lat, lng: greenData.center_lng }
      : { lat: 35.11420, lng: -89.93560 }

    if (!mapRef.current) {
      mapRef.current = new window.google.maps.Map(mapContainerRef.current, {
        center, zoom: 19, mapTypeId: 'satellite',
        disableDefaultUI: true, gestureHandling: 'greedy', tilt: 0,
      })
    } else {
      mapRef.current.setCenter(center)
    }
  }, [mapsReady, greenData])

  // Redraw canvas whenever annotations change
  useEffect(() => {
    redrawCanvas(canvasRef.current, annotations, null)
  }, [annotations])

  // Resize canvas to match map
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      redrawCanvas(canvas, annotationsRef.current, null)
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // Get canvas point from event
  function getPoint(e, canvas) {
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  function handleCanvasStart(e) {
    if (mode === 'view') return
    e.preventDefault()
    const canvas = canvasRef.current
    const pt = getPoint(e, canvas)
    if (mode === 'erase') {
      const W = canvas.width, H = canvas.height
      const threshold = 20
      const remaining = annotations.filter(a => {
        if (a.type === 'arrow') {
          const midX = ((a.x1 + a.x2) / 2) * W
          const midY = ((a.y1 + a.y2) / 2) * H
          return Math.hypot(pt.x - midX, pt.y - midY) > threshold
        }
        return Math.hypot(pt.x - a.x * W, pt.y - a.y * H) > threshold
      })
      setAnnotations(remaining)
      annotationsRef.current = remaining
      return
    }
    if (mode === 'note') {
      const text = prompt('Enter note:')
      if (!text) return
      const W = canvas.width, H = canvas.height
      const newAnn = [...annotationsRef.current, { type: 'note', x: pt.x / W, y: pt.y / H, text, color: '#fff' }]
      setAnnotations(newAnn)
      annotationsRef.current = newAnn
      return
    }
    setIsDrawing(true)
    setDrawStart(pt)
  }

  function handleCanvasMove(e) {
    if (!isDrawing || mode !== 'arrow') return
    e.preventDefault()
    const canvas = canvasRef.current
    const pt = getPoint(e, canvas)
    redrawCanvas(canvas, annotationsRef.current, { x1: drawStart.x, y1: drawStart.y, x2: pt.x, y2: pt.y, color: ARROW_COLORS[arrowColor] })
  }

  function handleCanvasEnd(e) {
    if (!isDrawing || mode !== 'arrow') return
    e.preventDefault()
    const canvas = canvasRef.current
    const pt = e.changedTouches
      ? { x: e.changedTouches[0].clientX - canvas.getBoundingClientRect().left, y: e.changedTouches[0].clientY - canvas.getBoundingClientRect().top }
      : getPoint(e, canvas)
    const W = canvas.width, H = canvas.height
    const newAnn = [...annotationsRef.current, {
      type: 'arrow',
      x1: drawStart.x / W, y1: drawStart.y / H,
      x2: pt.x / W, y2: pt.y / H,
      color: ARROW_COLORS[arrowColor],
    }]
    setAnnotations(newAnn)
    annotationsRef.current = newAnn
    setIsDrawing(false)
    setDrawStart(null)
    redrawCanvas(canvas, newAnn, null)
  }

  async function setGreenCenter() {
    if (!navigator.geolocation) { toast.error('GPS not available'); return }
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords
      setGpsPos({ lat, lng })
      const payload = {
        course_id: courseId, hole_number: hole,
        center_lat: lat, center_lng: lng,
        annotations: annotationsRef.current, notes,
        updated_by: player.id, updated_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('green_annotations').upsert(payload, { onConflict: 'course_id,hole_number' })
      if (error) toast.error('Failed to set center')
      else { toast.success(`Green center set for Hole ${hole}!`); loadGreen() }
    }, () => toast.error('Could not get GPS location'))
  }

  async function saveAnnotations() {
    setSaving(true)
    const payload = {
      course_id: courseId, hole_number: hole,
      center_lat: greenData?.center_lat ?? null,
      center_lng: greenData?.center_lng ?? null,
      annotations: annotationsRef.current, notes,
      updated_by: player.id, updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('green_annotations').upsert(payload, { onConflict: 'course_id,hole_number' })
    setSaving(false)
    if (error) toast.error('Save failed: ' + error.message)
    else toast.success('Greens book saved!')
  }

  function clearAll() {
    if (!confirm('Clear all arrows and notes for this hole?')) return
    setAnnotations([])
    annotationsRef.current = []
    redrawCanvas(canvasRef.current, [], null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Greens Book</h1>
        {courses.length > 1 && (
          <select
            value={courseId ?? ''}
            onChange={e => setCourseId(e.target.value)}
            className="bg-slate-800 text-white text-sm rounded px-2 py-1 border border-slate-600"
          >
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {/* Hole selector */}
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 18 }, (_, i) => i + 1).map(h => (
          <button
            key={h}
            onClick={() => { setHole(h); setMode('view') }}
            className={`w-9 h-9 rounded-full text-sm font-bold transition-colors ${hole === h ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            {h}
          </button>
        ))}
      </div>

      {/* Map + Canvas */}
      <div className="relative rounded-xl overflow-hidden border border-slate-700" style={{ height: 340 }}>
        {!mapsReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
            <span className="text-slate-400">Loading map...</span>
          </div>
        )}
        <div ref={mapContainerRef} className="absolute inset-0" />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ cursor: mode === 'view' ? 'default' : mode === 'erase' ? 'crosshair' : 'crosshair', touchAction: 'none' }}
          onMouseDown={handleCanvasStart}
          onMouseMove={handleCanvasMove}
          onMouseUp={handleCanvasEnd}
          onTouchStart={handleCanvasStart}
          onTouchMove={handleCanvasMove}
          onTouchEnd={handleCanvasEnd}
        />
        {/* Hole label */}
        <div className="absolute top-2 left-2 bg-black/70 text-white text-sm font-bold px-2 py-1 rounded">
          Hole {hole}
        </div>
        {!greenData?.center_lat && (
          <div className="absolute bottom-2 left-2 right-2 bg-yellow-900/80 text-yellow-300 text-xs px-2 py-1 rounded text-center">
            No pin center set — stand on the green and tap "Set Green Center"
          </div>
        )}
      </div>

      {/* Mode controls */}
      {canAdmin && (
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'view', label: '👁 View', },
              { id: 'arrow', label: '➡️ Arrow', },
              { id: 'note', label: '📝 Note', },
              { id: 'erase', label: '🗑 Erase', },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`px-3 py-1.5 rounded text-sm font-medium ${mode === m.id ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === 'arrow' && (
            <div className="flex gap-2 items-center">
              <span className="text-slate-400 text-xs">Color:</span>
              {Object.entries(ARROW_COLORS).map(([name, hex]) => (
                <button
                  key={name}
                  onClick={() => setArrowColor(name)}
                  className={`w-7 h-7 rounded-full border-2 ${arrowColor === name ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={setGreenCenter}
              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded text-sm"
            >
              📍 Set Green Center
            </button>
            <button onClick={clearAll} className="px-3 py-1.5 bg-red-900/60 hover:bg-red-800 text-red-300 rounded text-sm">
              Clear All
            </button>
            <button
              onClick={saveAnnotations}
              disabled={saving}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-semibold ml-auto"
            >
              {saving ? 'Saving...' : '💾 Save'}
            </button>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="space-y-1">
        <label className="text-slate-400 text-xs uppercase tracking-wide">Hole {hole} Notes</label>
        {canAdmin ? (
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Back right pin position breaks hard left. Front tier is very fast."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm resize-none"
            rows={3}
          />
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 text-sm min-h-[60px]">
            {notes || <span className="text-slate-500 italic">No notes yet for this hole.</span>}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-slate-800/50 rounded-lg p-3">
        <p className="text-slate-400 text-xs font-semibold uppercase mb-2">Break Legend</p>
        <div className="grid grid-cols-2 gap-1 text-xs">
          <div className="flex items-center gap-2"><span className="w-4 h-1 rounded" style={{ background: ARROW_COLORS.red }} /><span className="text-slate-300">Left break</span></div>
          <div className="flex items-center gap-2"><span className="w-4 h-1 rounded" style={{ background: ARROW_COLORS.blue }} /><span className="text-slate-300">Right break</span></div>
          <div className="flex items-center gap-2"><span className="w-4 h-1 rounded" style={{ background: ARROW_COLORS.yellow }} /><span className="text-slate-300">Grain direction</span></div>
          <div className="flex items-center gap-2"><span className="w-4 h-1 rounded" style={{ background: ARROW_COLORS.white }} /><span className="text-slate-300">General note</span></div>
        </div>
      </div>
    </div>
  )
}
