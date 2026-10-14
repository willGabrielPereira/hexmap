import { useEffect, useMemo, useRef, useState, type Dispatch } from 'react'
import { ArrowsOut, CursorClick, Minus, Plus, X } from '@phosphor-icons/react'
import { SIZE, anchorScale, scaleFromPoints, center, hexLine, isNeighbor, key, parse, pixelToHex } from './hex'
import { describeTool } from './palette'
import { MAP_ORIGIN, draw, mapBounds } from './render'
import { eraseHex, rulerText, setHex, setNote, setSecret, toggleLine, type Action } from './store'
import type { Item, MapDoc, Tool, View } from './types'

const MIN_ZOOM = 0.2, MAX_ZOOM = 4

type Props = { doc: MapDoc; dispatch: Dispatch<Action>; tool: Tool; measureHexes: number; onToolDone: () => void; onMeasured: () => void; secret: boolean }

export function MapCanvas({ doc, dispatch, tool, measureHexes, onToolDone, onMeasured, secret }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState<View>({ x: 40, y: 40, zoom: 1 })
  const [size, setSize] = useState<[number, number]>([0, 0])
  const [pending, setPending] = useState<{ k: string; kind: string }>() // 1º hex da linha (rio/estrada)
  const [waypoints, setWaypoints] = useState<string[]>([]) // régua: efêmero, fora do doc e do undo
  const [hover, setHover] = useState<string>()
  const [space, setSpace] = useState(false)
  const [panning, setPanning] = useState(false)
  const [edit, setEdit] = useState<{ k: string; value: string; secret: boolean }>()
  const [selected, setSelected] = useState<string>() // hex do painel de notas
  const noteSnapped = useRef(false) // 1 snap por edição da nota
  const cancelEdit = useRef(false)
  const fitted = useRef(false)
  const drag = useRef<'pan' | 'paint' | 'adjust' | null>(null)
  const wheelAt = useRef(0) // 1 snap por rolagem contínua no modo ajustar
  const [calib, setCalib] = useState<{ p: [number, number]; tool: Tool }>() // 1º ponto da medição (px da imagem)
  const [img, setImg] = useState<{ src: string; el: HTMLImageElement }>()

  const pend = pending?.kind === tool.kind ? pending.k : undefined // trocar de ferramenta descarta o pendente
  const c1 = calib?.tool === tool ? calib.p : undefined // idem: reentrar em "Medir escala" recomeça
  const path = useMemo(() => // concatena os trechos sem repetir as junções
    waypoints.flatMap((w, i) => (i ? hexLine(waypoints[i - 1], w).slice(1) : [w])), [waypoints])
  const sel = tool.kind === 'note' ? selected : undefined // painel só com a ferramenta Nota
  const src = doc.bg?.src
  const bgImg = img && img.src === src ? img.el : undefined // imagem antiga não é desenhada com os dados novos
  const dpr = window.devicePixelRatio || 1
  const live = useRef({ tool, view, onToolDone }) // o listener da roda e do Esc é montado uma vez
  live.current = { tool, view, onToolDone }

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
      const L = live.current
      if (L.tool.kind === 'adjust') { // a roda muda a escala do fundo; o zoom da view fica intacto
        if (e.timeStamp - wheelAt.current > 400) dispatch({ t: 'snap' })
        wheelAt.current = e.timeStamp
        const wx = (e.offsetX - L.view.x) / L.view.zoom, wy = (e.offsetY - L.view.y) / L.view.zoom, f = e.deltaY < 0 ? 1.1 : 1 / 1.1
        dispatch({ t: 'edit', fn: (d) => d.bg ? { ...d, bg: { ...d.bg, ...anchorScale(d.bg, f, wx, wy) } } : d })
        return
      }
      zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.offsetX, e.offsetY)
    }
    cv.addEventListener('wheel', wheel, { passive: false })
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (live.current.tool.kind === 'adjust') live.current.onToolDone(); setPending(undefined); setCalib(undefined); setWaypoints([]) } // setters estáveis: sem closure velha
      // com diálogo aberto o Espaço precisa ativar o botão focado
      else if (e.code === 'Space' && !typing(e) && !document.querySelector('dialog[open]')) { e.preventDefault(); setSpace(true) }
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
  }, [dispatch])

  useEffect(() => setWaypoints([]), [tool.kind]) // trocar de ferramenta limpa a régua

  useEffect(() => {
    if (!fitted.current && size[0] > 0) { fitted.current = true; setView(fitView()) }
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- só ajusta na primeira medição
  }, [size, doc])

  useEffect(() => {
    if (!src) return // src '' = imagem não carregada do IDB
    const el = new Image()
    el.onload = () => setImg({ src, el })
    el.src = src
    return () => { el.onload = null }
  }, [src])

  // realocar o canvas só quando o tamanho muda; hover/pan só redesenham
  useEffect(() => {
    const cv = ref.current!
    cv.width = size[0] * dpr
    cv.height = size[1] * dpr
  }, [size, dpr])

  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, cv.width, cv.height)
    const pk = tool.kind === 'river' || tool.kind === 'road' ? tool.kind : undefined
    draw(ctx, doc, { x: view.x * dpr, y: view.y * dpr, zoom: view.zoom * dpr }, { pending: pend, hover: tool.kind === 'adjust' || tool.kind === 'calibrate' ? undefined : hover, pendingKind: pk, chrome: true, adjust: tool.kind === 'adjust' || tool.kind === 'calibrate', measure: tool.kind === 'calibrate', marker: c1 && doc.bg ? [doc.bg.x + c1[0] * doc.bg.scale, doc.bg.y + c1[1] * doc.bg.scale] : undefined, img: bgImg, secrets: true, selected: sel, path: tool.kind === 'ruler' ? path : undefined })
  }, [doc, view, size, pend, hover, tool.kind, dpr, bgImg, sel, path, c1])

  // hex sob o evento, ou undefined se fora do mapa
  const hexAt = (e: React.MouseEvent) => {
    const [c, r] = pixelToHex((e.nativeEvent.offsetX - view.x) / view.zoom, (e.nativeEvent.offsetY - view.y) / view.zoom)
    return c >= 0 && r >= 0 && c < doc.cols && r < doc.rows ? key(c, r) : undefined
  }

  const apply = (k: string) => {
    if (tool.kind === 'erase') dispatch({ t: 'edit', fn: secret ? setSecret(k, null) : eraseHex(k) })
    else if (tool.kind === 'terrain' || tool.kind === 'icon') {
      if (!Object.hasOwn(tool.kind === 'terrain' ? doc.terrains : doc.icons, tool.id)) return // id fora do catálogo
      // terreno é sempre público
      dispatch({ t: 'edit', fn: secret && tool.kind === 'icon' ? setSecret(k, { icon: tool.id }) : setHex(k, { [tool.kind]: tool.id }) })
    }
  }

  const down = (e: React.PointerEvent) => {
    setShowHint(false)
    e.currentTarget.setPointerCapture(e.pointerId)
    if (e.button !== 0 || space) { drag.current = 'pan'; setPanning(true); return }
    if (tool.kind === 'adjust') {
      if (!doc.bg) return
      drag.current = 'adjust'
      dispatch({ t: 'snap' }) // 1 snap por arrasto
      return
    }
    if (tool.kind === 'calibrate') { // antes de hexAt: a imagem pode exceder o mapa
      const bg = doc.bg
      if (!bg) return
      const wx = (e.nativeEvent.offsetX - view.x) / view.zoom, wy = (e.nativeEvent.offsetY - view.y) / view.zoom
      const p: [number, number] = [(wx - bg.x) / bg.scale, (wy - bg.y) / bg.scale]
      if (!c1) { setCalib({ p, tool }); return }
      if (Math.abs(p[0] - c1[0]) < 1) return // mesma posição horizontal: escala infinita
      dispatch({ t: 'snap' })
      dispatch({ t: 'edit', fn: (d) => d.bg ? { ...d, bg: { ...d.bg, ...scaleFromPoints(c1, p, measureHexes, d.bg) } } : d })
      setCalib(undefined)
      onMeasured()
      return
    }
    const k = hexAt(e)
    if (!k) return
    if (tool.kind === 'ruler') { setWaypoints((w) => [...w, k]); return } // sem snap e sem paint
    if (tool.kind === 'river' || tool.kind === 'road') {
      if (pend && isNeighbor(pend, k)) {
        dispatch({ t: 'snap' })
        dispatch({ t: 'edit', fn: toggleLine(pend, k, tool.kind) })
      }
      setPending({ k, kind: tool.kind })
    } else if (tool.kind === 'note') { // só seleciona: sem snap e sem arrasto
      noteSnapped.current = false
      setSelected(k)
    } else if (tool.kind === 'terrain' || tool.kind === 'icon' || tool.kind === 'erase') {
      // rótulo abre no click (o foco do mousedown roubaria o do input)
      drag.current = 'paint'
      dispatch({ t: 'snap' })
      apply(k)
    }
  }

  const click = (e: React.MouseEvent) => {
    const k = tool.kind === 'label' && !space ? hexAt(e) : undefined
    if (!k) return
    cancelEdit.current = false
    const h = doc.hexes[k]
    setEdit({ k, value: (secret ? h?.secret?.label : h?.label) ?? '', secret })
  }

  const move = (e: React.PointerEvent) => {
    if (drag.current === 'pan') { setView((v) => ({ ...v, x: v.x + e.movementX, y: v.y + e.movementY })); return }
    if (drag.current === 'adjust') {
      const z = view.zoom
      dispatch({ t: 'edit', fn: (d) => d.bg ? { ...d, bg: { ...d.bg, x: d.bg.x + e.movementX / z, y: d.bg.y + e.movementY / z } } : d })
      return
    }
    if (tool.kind === 'adjust' || tool.kind === 'calibrate') return
    const k = hexAt(e)
    setHover((h) => (h === k ? h : k))
    if (drag.current === 'paint' && k) apply(k)
  }

  const commit = () => {
    if (!edit) return
    const { k, value } = edit
    const h = doc.hexes[k]
    setEdit(undefined)
    if (cancelEdit.current || value.trim() === ((edit.secret ? h?.secret?.label : h?.label) ?? '')) return
    dispatch({ t: 'snap' })
    dispatch({ t: 'edit', fn: edit.secret ? setSecret(k, { label: value.trim() }) : setHex(k, { label: value.trim() || undefined }) })
  }

  const editNote = (text: string) => {
    if (!sel) return
    if (!noteSnapped.current) { noteSnapped.current = true; dispatch({ t: 'snap' }) }
    dispatch({ t: 'edit', fn: setNote(sel, text) })
  }
  const item = (it: Item | undefined) => [it?.icon && (doc.icons[it.icon]?.name ?? it.icon), it?.label].filter(Boolean).join(' · ') || '—'
  const selHex = sel ? doc.hexes[sel] : undefined

  const info = describeTool(tool, doc)
  const hint = tool.kind === 'ruler' && path.length ? `Régua: ${rulerText(doc, path)} · Esc limpa` : pend ? 'Clique num hex vizinho para continuar · Esc cancela'
    : c1 ? 'Medir 2/2: clique no lado oposto (informe quantos hexes separam os dois lados) · Esc cancela'
    : (tool.kind === 'calibrate' || tool.kind === 'adjust') && !doc.bg ? 'Carregue uma imagem de fundo primeiro'
    : secret && tool.kind === 'erase' ? 'Clique ou arraste para limpar só o segredo'
    : secret && tool.kind === 'terrain' ? 'Terreno é sempre público' : info.hint
  const [showHint, setShowHint] = useState(true)
  const empty = !Object.keys(doc.hexes).length && !doc.lines.length
  const cursor = panning ? 'grabbing' : space ? 'grab' : tool.kind === 'adjust' ? 'move' : tool.kind === 'label' ? 'text' : 'crosshair'
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
          className={`label-edit ${edit.secret ? 'secret' : ''}`}
          autoFocus
          maxLength={40}
          placeholder={edit.secret ? 'Rótulo secreto…' : 'Rótulo…'}
          aria-label={edit.secret ? 'Rótulo secreto' : 'Rótulo'}
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

      {sel && (
        <div className="notes" role="region" aria-label={`Hex ${sel}`}>
          <header>
            <strong>Hex {sel}</strong>
            <button className="icon-btn" aria-label="Fechar notas" onClick={() => setSelected(undefined)}><X /></button>
          </header>
          <label htmlFor="note-text">Nota do mestre</label>
          <textarea id="note-text" rows={6} value={selHex?.note ?? ''} placeholder="Só aparece nas notas do mestre (.md)"
            onChange={(e) => editNote(e.target.value)} onBlur={() => { noteSnapped.current = false }} />
          <dl>
            <dt>Público</dt><dd>{item(selHex)}</dd>
            <dt>Segredo</dt><dd>{item(selHex?.secret)}</dd>
          </dl>
        </div>
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
        {secret && <span className="status-secret">SEGREDO</span>}
        <span className="status-tool">{info.name}</span>
        <span className="status-hint">{hint}</span>
        <span className="status-sep" />
        <span className="status-hint"><kbd>Espaço</kbd> + arrastar move</span>
        {hover && <span className="status-coord">{hover}</span>}
      </div>
    </div>
  )
}
