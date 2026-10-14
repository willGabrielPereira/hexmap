import { useEffect, useRef, useState, type Dispatch } from 'react'
import { ArrowsOut, CursorClick, Minus, Plus, X } from '@phosphor-icons/react'
import { SIZE, center, isNeighbor, key, parse, pixelToHex } from './hex'
import { describeTool } from './palette'
import { MAP_ORIGIN, draw, mapBounds } from './render'
import { setHex, toggleLine, type Action } from './store'
import type { MapDoc, Tool, View } from './types'

const MIN_ZOOM = 0.2, MAX_ZOOM = 4

export function MapCanvas({ doc, dispatch, tool }: { doc: MapDoc; dispatch: Dispatch<Action>; tool: Tool }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState<View>({ x: 40, y: 40, zoom: 1 })
  const [size, setSize] = useState<[number, number]>([0, 0])
  const [pending, setPending] = useState<{ k: string; kind: string }>() // 1º hex da linha (rio/estrada)
  const [hover, setHover] = useState<string>()
  const [space, setSpace] = useState(false)
  const [panning, setPanning] = useState(false)
  const [edit, setEdit] = useState<{ k: string; value: string }>()
  const cancelEdit = useRef(false)
  const fitted = useRef(false)
  const drag = useRef<'pan' | 'paint' | null>(null)

  const pend = pending?.kind === tool.kind ? pending.k : undefined // trocar de ferramenta descarta o pendente
  const dpr = window.devicePixelRatio || 1

  const fitView = (): View => {
    const [bw, bh] = mapBounds(doc)
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((size[0] - 96) / bw, (size[1] - 160) / bh)))
    return { zoom, x: (size[0] - bw * zoom) / 2 - MAP_ORIGIN[0] * zoom, y: (size[1] - bh * zoom) / 2 - MAP_ORIGIN[1] * zoom }
  }

  const zoomAt = (f: number, px: number, py: number) =>
    setView((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * f))
      const k = zoom / v.zoom // mantém o ponto sob o cursor fixo
      return { zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
    })

  useEffect(() => {
    const cv = ref.current!
    const ro = new ResizeObserver(() => setSize([cv.clientWidth, cv.clientHeight]))
    ro.observe(cv)
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.offsetX, e.offsetY)
    }
    cv.addEventListener('wheel', wheel, { passive: false })
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPending(undefined)
      else if (e.code === 'Space' && !typing(e)) { e.preventDefault(); setSpace(true) }
    }
    const ku = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      ro.disconnect()
      cv.removeEventListener('wheel', wheel)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
    }
  }, [])

  useEffect(() => {
    if (!fitted.current && size[0] > 0) { fitted.current = true; setView(fitView()) }
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- só ajusta na primeira medição
  }, [size, doc])

  useEffect(() => {
    const cv = ref.current!
    cv.width = size[0] * dpr
    cv.height = size[1] * dpr
    const pk = tool.kind === 'river' || tool.kind === 'road' ? tool.kind : undefined
    draw(cv.getContext('2d')!, doc, { x: view.x * dpr, y: view.y * dpr, zoom: view.zoom * dpr }, { pending: pend, hover, pendingKind: pk, chrome: true })
  }, [doc, view, size, pend, hover, tool.kind, dpr])

  // hex sob o evento, ou undefined se fora do mapa
  const hexAt = (e: React.MouseEvent) => {
    const [c, r] = pixelToHex((e.nativeEvent.offsetX - view.x) / view.zoom, (e.nativeEvent.offsetY - view.y) / view.zoom)
    return c >= 0 && r >= 0 && c < doc.cols && r < doc.rows ? key(c, r) : undefined
  }

  const apply = (k: string) => {
    if (tool.kind === 'terrain') dispatch({ t: 'edit', fn: setHex(k, { terrain: tool.id }) })
    else if (tool.kind === 'icon') dispatch({ t: 'edit', fn: setHex(k, { icon: tool.id }) })
    else if (tool.kind === 'erase') dispatch({ t: 'edit', fn: setHex(k, null) })
  }

  const down = (e: React.PointerEvent) => {
    setShowHint(false)
    e.currentTarget.setPointerCapture(e.pointerId)
    if (e.button !== 0 || space) { drag.current = 'pan'; setPanning(true); return }
    const k = hexAt(e)
    if (!k) return
    if (tool.kind === 'river' || tool.kind === 'road') {
      if (pend && isNeighbor(pend, k)) {
        dispatch({ t: 'snap' })
        dispatch({ t: 'edit', fn: toggleLine(pend, k, tool.kind) })
      }
      setPending({ k, kind: tool.kind })
    } else if (tool.kind !== 'label') { // rótulo abre no click (o foco do mousedown roubaria o do input)
      drag.current = 'paint'
      dispatch({ t: 'snap' })
      apply(k)
    }
  }

  const click = (e: React.MouseEvent) => {
    const k = tool.kind === 'label' && !space ? hexAt(e) : undefined
    if (!k) return
    cancelEdit.current = false
    setEdit({ k, value: doc.hexes[k]?.label ?? '' })
  }

  const move = (e: React.PointerEvent) => {
    if (drag.current === 'pan') { setView((v) => ({ ...v, x: v.x + e.movementX, y: v.y + e.movementY })); return }
    const k = hexAt(e)
    setHover((h) => (h === k ? h : k))
    if (drag.current === 'paint' && k) apply(k)
  }

  const commit = () => {
    if (!edit) return
    const { k, value } = edit
    setEdit(undefined)
    if (cancelEdit.current || value.trim() === (doc.hexes[k]?.label ?? '')) return
    dispatch({ t: 'snap' })
    dispatch({ t: 'edit', fn: setHex(k, { label: value.trim() || undefined }) })
  }

  const info = describeTool(tool)
  const hint = pend ? 'Clique num hex vizinho para continuar · Esc cancela' : info.hint
  const [showHint, setShowHint] = useState(true)
  const empty = !Object.keys(doc.hexes).length && !doc.lines.length
  const cursor = panning ? 'grabbing' : space ? 'grab' : tool.kind === 'label' ? 'text' : 'crosshair'
  const [ex, ey] = edit ? center(...parse(edit.k)) : [0, 0]

  return (
    <div className="stage">
      <canvas
        ref={ref}
        style={{ cursor }}
        onPointerDown={down}
        onClick={click}
        onPointerMove={move}
        onPointerUp={() => { drag.current = null; setPanning(false) }}
        onPointerLeave={() => setHover(undefined)}
        onContextMenu={(e) => e.preventDefault()}
      />

      {edit && (
        <input
          className="label-edit"
          autoFocus
          maxLength={40}
          placeholder="Rótulo…"
          value={edit.value}
          style={{ left: view.x + ex * view.zoom, top: view.y + (ey + SIZE * 0.6) * view.zoom }}
          onChange={(e) => setEdit({ ...edit, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            else if (e.key === 'Escape') { cancelEdit.current = true; e.currentTarget.blur() }
          }}
          onBlur={commit}
        />
      )}

      {empty && showHint && (
        <div className="empty">
          <button className="icon-btn empty-close" aria-label="Fechar dica" onClick={() => setShowHint(false)}><X /></button>
          <CursorClick size={28} weight="duotone" />
          <strong>Mapa vazio</strong>
          <span>Escolha um terreno na barra lateral e clique ou arraste sobre os hexes para pintar.</span>
        </div>
      )}

      <div className="zoom" role="group" aria-label="Zoom">
        <button className="icon-btn" aria-label="Diminuir zoom" onClick={() => zoomAt(1 / 1.25, size[0] / 2, size[1] / 2)}><Minus /></button>
        <button className="zoom-val" title="Ajustar à tela" onClick={() => setView(fitView())}>{Math.round(view.zoom * 100)}%</button>
        <button className="icon-btn" aria-label="Aumentar zoom" onClick={() => zoomAt(1.25, size[0] / 2, size[1] / 2)}><Plus /></button>
        <span className="sep" />
        <button className="icon-btn" aria-label="Ajustar à tela" title="Ajustar à tela" onClick={() => setView(fitView())}><ArrowsOut /></button>
      </div>

      <div className="status" aria-live="polite">
        <span className="status-tool">{info.name}</span>
        <span className="status-hint">{hint}</span>
        <span className="status-sep" />
        <span className="status-hint"><kbd>Espaço</kbd> + arrastar move</span>
        {hover && <span className="status-coord">{hover}</span>}
      </div>
    </div>
  )
}
