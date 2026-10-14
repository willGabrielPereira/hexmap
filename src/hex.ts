// Hex pointy-top, coordenadas offset "odd-r" (col,row), chave "col,row".
import type { Bg } from './types'

export const SIZE = 40
const S3 = Math.sqrt(3)

export const key = (c: number, r: number) => `${c},${r}`
export const parse = (k: string) => k.split(',').map(Number) as [number, number]

export function center(c: number, r: number): [number, number] {
  return [SIZE * S3 * (c + 0.5 * (r & 1)), SIZE * 1.5 * r]
}

export function corners(c: number, r: number): [number, number][] {
  const [cx, cy] = center(c, r)
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30)
    return [cx + SIZE * Math.cos(a), cy + SIZE * Math.sin(a)]
  })
}

export function pixelToHex(x: number, y: number): [number, number] {
  const fq = ((S3 / 3) * x - y / 3) / SIZE
  const fr = ((2 / 3) * y) / SIZE
  let q = Math.round(fq), r = Math.round(fr)
  const s = Math.round(-fq - fr)
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - (-fq - fr))
  if (dq > dr && dq > ds) q = -r - s
  else if (dr > ds) r = -q - s
  return [q + (r - (r & 1)) / 2 + 0, r + 0] // + 0 normaliza -0
}

const NB = [
  [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]], // linhas pares
  [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]], // linhas ímpares
]
export const neighbors = (c: number, r: number): [number, number][] =>
  NB[r & 1].map(([dc, dr]) => [c + dc, r + dr])

export const isNeighbor = (a: string, b: string) => {
  const [c, r] = parse(a)
  return neighbors(c, r).some(([nc, nr]) => key(nc, nr) === b)
}

// fundo: escala por `factor` (limitada) mantendo fixo o ponto de mundo (wx, wy)
export const BG_SCALE = [0.02, 20] as const
export function anchorScale(bg: Pick<Bg, 'x' | 'y' | 'scale'>, factor: number, wx: number, wy: number): Pick<Bg, 'x' | 'y' | 'scale'> {
  const scale = Math.min(BG_SCALE[1], Math.max(BG_SCALE[0], bg.scale * factor))
  const k = scale / bg.scale
  return { x: wx - (wx - bg.x) * k, y: wy - (wy - bg.y) * k, scale }
}

// fundo: p1, p2 = pontos da imagem (px) a `hexes` larguras de hex um do outro NA HORIZONTAL (lados verticais do hex
// pontudo: a altura do clique não importa); p1 fica fixo no mundo
export function scaleFromPoints(p1: [number, number], p2: [number, number], hexes: number, cur: Pick<Bg, 'x' | 'y' | 'scale'>): Pick<Bg, 'x' | 'y' | 'scale'> {
  const d = Math.abs(p2[0] - p1[0])
  if (!(d > 0) || !Number.isFinite(d) || !(hexes > 0) || !Number.isFinite(hexes)) return cur
  const scale = Math.min(BG_SCALE[1], Math.max(BG_SCALE[0], (hexes * SIZE * S3) / d))
  return { x: cur.x + p1[0] * (cur.scale - scale), y: cur.y + p1[1] * (cur.scale - scale), scale }
}

// aresta compartilhada por dois hexes vizinhos: os 2 cantos de `a` mais próximos do centro de `b`
export function sharedEdge(a: string, b: string): [number, number][] {
  const [bx, by] = center(...parse(b))
  return corners(...parse(a))
    .sort((p, q) => Math.hypot(p[0] - bx, p[1] - by) - Math.hypot(q[0] - bx, q[1] - by))
    .slice(0, 2)
}

// distância em hexes (odd-r -> axial -> cubo)
export function hexDistance(a: string, b: string): number {
  const ax = (k: string) => { const [c, r] = parse(k); return [c - (r - (r & 1)) / 2, r] }
  const [aq, ar] = ax(a), [bq, br] = ax(b)
  const dq = aq - bq, dr = ar - br
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

// hexes atravessados por a -> b; o desvio (1e-6, 2e-6) evita empates exatos nas arestas
export function hexLine(a: string, b: string): string[] {
  const n = hexDistance(a, b)
  if (n === 0) return [a]
  const [ax, ay] = center(...parse(a)), [bx, by] = center(...parse(b))
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    return key(...pixelToHex(ax + (bx - ax) * t + 1e-6, ay + (by - ay) * t + 2e-6))
  })
}
