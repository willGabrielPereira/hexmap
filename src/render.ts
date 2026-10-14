import { BG_SCALE, SIZE, center, corners, key, neighbors, parse, sharedEdge } from './hex'
import { glyphPath } from './icons'
import type { Bg, MapDoc, View } from './types'

export function mapBounds(d: MapDoc): [number, number] {
  return [SIZE * Math.sqrt(3) * (d.cols + 0.5), SIZE * (1.5 * d.rows + 0.5)]
}

// ponto de origem do mapa no espaço do mundo (hex 0,0 tem centro em 0,0)
export const MAP_ORIGIN: [number, number] = [-SIZE * Math.sqrt(3) * 0.5, -SIZE]

const PAPER = '#ece8dc'

// o fundo cobre o retângulo do mapa? (aviso na UI)
export function bgCovers(bg: Bg, d: MapDoc): boolean {
  const [w, h] = mapBounds(d)
  return bg.x <= MAP_ORIGIN[0] && bg.y <= MAP_ORIGIN[1]
    && bg.x + bg.w * bg.scale >= MAP_ORIGIN[0] + w && bg.y + bg.h * bg.scale >= MAP_ORIGIN[1] + h
}

// imagem -> mapa, sem distorcer: menor escala uniforme que cobre o mapa, centralizada (o excesso é cortado)
export function fitBgToMap(bg: Bg, d: MapDoc): Pick<Bg, 'x' | 'y' | 'scale'> {
  const [w, h] = mapBounds(d)
  const scale = Math.min(BG_SCALE[1], Math.max(BG_SCALE[0], w / bg.w, h / bg.h))
  return { scale, x: MAP_ORIGIN[0] + (w - bg.w * scale) / 2, y: MAP_ORIGIN[1] + (h - bg.h * scale) / 2 }
}

// mapa -> imagem: encosta a imagem na origem (se ela começa depois) e reduz colunas/linhas ao que cabe nela.
// Só diminui (nunca passa do tamanho atual) e respeita o mínimo de 5.
export function fitMapToBg(bg: Bg, d: MapDoc): { cols: number; rows: number; x: number; y: number } {
  const x = Math.min(bg.x, MAP_ORIGIN[0]), y = Math.min(bg.y, MAP_ORIGIN[1])
  const fitCols = Math.floor((x + bg.w * bg.scale - MAP_ORIGIN[0]) / (SIZE * Math.sqrt(3)) - 0.5)
  const fitRows = Math.floor(((y + bg.h * bg.scale - MAP_ORIGIN[1]) / SIZE - 0.5) / 1.5)
  return { x, y, cols: Math.max(5, Math.min(d.cols, fitCols)), rows: Math.max(5, Math.min(d.rows, fitRows)) }
}

// grid: padrão true; secrets: padrão false (barreira extra além de filterDoc; true só no editor e na versão do mestre)
export type DrawOpts = {
  pending?: string; hover?: string; pendingKind?: 'river' | 'road'; chrome?: boolean
  img?: HTMLImageElement; grid?: boolean; secrets?: boolean; selected?: string
  path?: string[] // traçado da régua: só em chrome
  measure?: boolean // medir escala: esconde a grade do app (só em chrome com fundo)
  adjust?: boolean // ajuste do fundo: imagem opaca, hexes só com contorno; só em chrome (nunca no export)
  marker?: [number, number] // 1º ponto da calibragem (mundo); só em chrome
}

const SECRET = '#a855f7'

function glyph(ctx: CanvasRenderingContext2D, g: string, x: number, y: number, size: number, color: string) {
  const s = size / 256
  ctx.save()
  ctx.translate(x - 128 * s, y - 128 * s)
  ctx.scale(s, s)
  ctx.lineWidth = 18 // halo claro para ler sobre qualquer terreno
  ctx.strokeStyle = '#ffffffd9'
  ctx.stroke(glyphPath(g))
  ctx.fillStyle = color
  ctx.fill(glyphPath(g))
  ctx.restore()
}

function text(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, font: string, color: string) {
  ctx.font = font
  ctx.lineWidth = 3
  ctx.strokeStyle = '#fff'
  ctx.strokeText(t, x, y)
  ctx.fillStyle = color
  ctx.fillText(t, x, y)
}

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

  const bg = o.img && d.bg?.src ? d.bg : undefined
  if (bg) {
    const [w, h] = mapBounds(d)
    ctx.save()
    ctx.beginPath()
    ctx.rect(MAP_ORIGIN[0], MAP_ORIGIN[1], w, h)
    ctx.clip()
    ctx.fillStyle = PAPER // base clara: baixar a opacidade clareia a imagem em vez de escurecê-la contra a mesa
    ctx.fillRect(MAP_ORIGIN[0], MAP_ORIGIN[1], w, h)
    ctx.globalAlpha = o.adjust && chrome ? 1 : bg.opacity // decisão: opacidade 1 durante o ajuste
    ctx.drawImage(o.img!, bg.x, bg.y, bg.w * bg.scale, bg.h * bg.scale)
    ctx.restore()
  }

  const style = d.style ?? 'solid'
  const hexAlpha = d.hexOpacity ?? (style === 'tint' ? 0.45 : 1)
  for (let r = 0; r < d.rows; r++)
    for (let c = 0; c < d.cols; c++) {
      const h = d.hexes[key(c, r)]
      const color = h?.terrain && d.terrains[h.terrain]?.color
      if (o.measure && chrome && bg) continue // medir escala: sem grade do app sobre a imagem
      hexPath(ctx, c, r)
      if (o.adjust && chrome && bg) { // contorno claro + escuro: legível sobre qualquer imagem
        ctx.strokeStyle = '#ffffffcc'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.strokeStyle = '#000000b3'
        ctx.lineWidth = 1
        ctx.stroke()
        continue
      }
      if (color && style === 'outline') {
        ctx.save()
        ctx.clip() // contorno só por dentro do hex
        ctx.strokeStyle = color
        ctx.lineWidth = 6
        ctx.stroke()
        ctx.restore()
      } else if (color || !bg) { // hex vazio só é preenchido sem fundo
        ctx.globalAlpha = color ? hexAlpha : 1
        ctx.fillStyle = color || PAPER
        ctx.fill()
        ctx.globalAlpha = 1
      }
      if (o.grid ?? true) {
        ctx.strokeStyle = '#0000002e'
        ctx.lineWidth = 1
        ctx.stroke()
      }
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
    const def = h.icon ? d.icons[h.icon] : undefined
    if (def) glyph(ctx, def.glyph, cx, cy - 2, SIZE * 1.1, def.color ?? '#1a1d24')
    if (h.label) text(ctx, h.label, cx, cy + SIZE * 0.6, '600 12px "Geist", system-ui, sans-serif', '#000')
    if (!o.secrets || !h.secret) continue
    const sd = h.secret.icon ? d.icons[h.secret.icon] : undefined
    if (sd) { // menor, canto superior direito, anel tracejado: distingue sem depender da cor
      const [sx, sy] = [cx + SIZE * 0.42, cy - SIZE * 0.42]
      ctx.beginPath()
      ctx.arc(sx, sy, SIZE * 0.3, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffffe6'
      ctx.fill()
      ctx.setLineDash([3, 2.5])
      ctx.strokeStyle = SECRET
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.setLineDash([])
      glyph(ctx, sd.glyph, sx, sy, SIZE * 0.42, sd.color ?? SECRET)
    }
    if (h.secret.label) text(ctx, `[${h.secret.label}]`, cx, cy - SIZE * 0.62, 'italic 600 11px "Geist", system-ui, sans-serif', SECRET)
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
  if (o.path?.length) {
    ctx.beginPath()
    o.path.forEach((k, i) => (i ? ctx.lineTo(...center(...parse(k))) : ctx.moveTo(...center(...parse(k)))))
    ctx.strokeStyle = '#f6ad55'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.stroke()
    for (const [i, k] of o.path.entries()) {
      ctx.beginPath()
      ctx.arc(...center(...parse(k)), i ? 5 : 8, 0, Math.PI * 2)
      ctx.fillStyle = '#f6ad55'
      ctx.fill()
    }
  }
  if (o.marker) {
    ctx.beginPath()
    ctx.arc(...o.marker, 7, 0, Math.PI * 2)
    ctx.fillStyle = '#f6ad55'
    ctx.fill()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.stroke()
  }
  if (o.selected) {
    hexPath(ctx, ...parse(o.selected))
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
