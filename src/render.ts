import { SIZE, center, corners, key, neighbors, parse, sharedEdge } from './hex'
import { featurePath, normalizeIcon } from './icons'
import { TERRAINS } from './palette'
import type { MapDoc, View } from './types'

export function mapBounds(d: MapDoc): [number, number] {
  return [SIZE * Math.sqrt(3) * (d.cols + 0.5), SIZE * (1.5 * d.rows + 0.5)]
}

// ponto de origem do mapa no espaço do mundo (hex 0,0 tem centro em 0,0)
export const MAP_ORIGIN: [number, number] = [-SIZE * Math.sqrt(3) * 0.5, -SIZE]

export type DrawOpts = { pending?: string; hover?: string; pendingKind?: 'river' | 'road'; chrome?: boolean }

function hexPath(ctx: CanvasRenderingContext2D, c: number, r: number) {
  ctx.beginPath()
  corners(c, r).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
}

export function draw(ctx: CanvasRenderingContext2D, d: MapDoc, v: View, o: DrawOpts = {}) {
  const { pending, hover, chrome } = o
  ctx.save()
  ctx.setTransform(v.zoom, 0, 0, v.zoom, v.x, v.y)
  ctx.lineJoin = 'round'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (chrome) { // "mesa" do mapa: separa a área editável do fundo
    const [w, h] = mapBounds(d)
    ctx.save()
    ctx.shadowColor = '#0009'
    ctx.shadowBlur = 24 * v.zoom
    ctx.fillStyle = '#1b1f27'
    ctx.beginPath()
    ctx.roundRect(MAP_ORIGIN[0] - 12, MAP_ORIGIN[1] - 12, w + 24, h + 24, 14)
    ctx.fill()
    ctx.restore()
  }

  for (let r = 0; r < d.rows; r++)
    for (let c = 0; c < d.cols; c++) {
      const h = d.hexes[key(c, r)]
      hexPath(ctx, c, r)
      ctx.fillStyle = (h?.terrain && TERRAINS[h.terrain]?.color) || '#ece8dc'
      ctx.fill()
      ctx.strokeStyle = '#0000002e'
      ctx.lineWidth = 1
      ctx.stroke()
    }

  for (const l of d.lines) {
    ctx.beginPath()
    if (l.kind === 'river') {
      const [p, q] = sharedEdge(l.a, l.b)
      ctx.moveTo(...p)
      ctx.lineTo(...q)
      ctx.strokeStyle = '#2a6fc9'
      ctx.lineWidth = 5
      ctx.setLineDash([])
    } else {
      ctx.moveTo(...center(...parse(l.a)))
      ctx.lineTo(...center(...parse(l.b)))
      ctx.strokeStyle = '#6b4a2b'
      ctx.lineWidth = 3
      ctx.setLineDash([8, 5])
    }
    ctx.lineCap = 'round'
    ctx.stroke()
  }
  ctx.setLineDash([])

  for (const [k, h] of Object.entries(d.hexes)) {
    const [cx, cy] = center(...parse(k))
    const p = h.icon ? featurePath(normalizeIcon(h.icon)) : undefined
    if (p) {
      const s = (SIZE * 1.1) / 256
      ctx.save()
      ctx.translate(cx - 128 * s, cy - 128 * s - 2)
      ctx.scale(s, s)
      ctx.lineWidth = 18 // halo claro para ler sobre qualquer terreno
      ctx.strokeStyle = '#ffffffd9'
      ctx.stroke(p)
      ctx.fillStyle = '#1a1d24'
      ctx.fill(p)
      ctx.restore()
    }
    if (h.label) {
      ctx.font = '600 12px "Geist", system-ui, sans-serif'
      ctx.lineWidth = 3
      ctx.strokeStyle = '#fff'
      ctx.strokeText(h.label, cx, cy + SIZE * 0.6)
      ctx.fillStyle = '#000'
      ctx.fillText(h.label, cx, cy + SIZE * 0.6)
    }
  }

  if (!chrome) { ctx.restore(); return }

  // --- sobreposições de edição (não exportadas) ---
  const accent = '#4fd1c5'
  if (pending) {
    const [pc, pr] = parse(pending)
    for (const [nc, nr] of neighbors(pc, pr)) {
      if (nc < 0 || nr < 0 || nc >= d.cols || nr >= d.rows) continue
      hexPath(ctx, nc, nr)
      ctx.fillStyle = '#4fd1c522'
      ctx.fill()
    }
    if (hover && hover !== pending) {
      const [hc, hr] = parse(hover)
      if (neighbors(pc, pr).some(([a, b]) => a === hc && b === hr)) {
        ctx.beginPath()
        const [p, q] = o.pendingKind === 'river' ? sharedEdge(pending, hover) : [center(pc, pr), center(hc, hr)]
        ctx.moveTo(...p)
        ctx.lineTo(...q)
        ctx.strokeStyle = accent
        ctx.lineWidth = 4
        ctx.lineCap = 'round'
        ctx.setLineDash([2, 8])
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
    hexPath(ctx, pc, pr)
    ctx.fillStyle = '#4fd1c544'
    ctx.fill()
    ctx.strokeStyle = accent
    ctx.lineWidth = 3.5
    ctx.stroke()
  }
  if (hover) {
    hexPath(ctx, ...parse(hover))
    ctx.fillStyle = '#ffffff40'
    ctx.fill()
    ctx.strokeStyle = '#0d0f13e6'
    ctx.lineWidth = 2
    ctx.stroke()
  }
  ctx.restore()
}
