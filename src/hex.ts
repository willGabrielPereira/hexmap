// Hex pointy-top, coordenadas offset "odd-r" (col,row), chave "col,row".
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

// aresta compartilhada por dois hexes vizinhos: os 2 cantos de `a` mais próximos do centro de `b`
export function sharedEdge(a: string, b: string): [number, number][] {
  const [bx, by] = center(...parse(b))
  return corners(...parse(a))
    .sort((p, q) => Math.hypot(p[0] - bx, p[1] - by) - Math.hypot(q[0] - bx, q[1] - by))
    .slice(0, 2)
}
