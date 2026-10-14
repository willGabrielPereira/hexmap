import { expect, test } from 'vitest'
import { SIZE, anchorScale, scaleFromPoints, center, hexDistance, hexLine, isNeighbor, key, neighbors, pixelToHex } from './hex'
import { MAP_ORIGIN, bgCovers, fitBgToMap, fitMapToBg, mapBounds } from './render'
import { emptyDoc } from './store'

test('pixel -> hex round-trip e vizinhança', () => {
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 6; c++) {
      const [x, y] = center(c, r)
      expect(pixelToHex(x, y)).toEqual([c, r])
      expect(pixelToHex(x + 5, y - 5)).toEqual([c, r])
      for (const [nc, nr] of neighbors(c, r)) expect(isNeighbor(key(nc, nr), key(c, r))).toBe(true)
    }
})

const W = SIZE * Math.sqrt(3) // largura de um hex
test('scaleFromPoints: p1 fixo no mundo e escala certa', () => {
  const cur = { x: 10, y: -20, scale: 2 }
  // p1 (100, 50) -> mundo (210, 80); p2 a 200 px na horizontal = 10 hexes
  const g = scaleFromPoints([100, 50], [300, 50], 10, cur)
  expect(g.scale).toBeCloseTo((10 * W) / 200, 9)
  expect(g.x + 100 * g.scale).toBeCloseTo(210, 9)
  expect(g.y + 50 * g.scale).toBeCloseTo(80, 9)
  expect(scaleFromPoints([100, 50], [300, 50], 7.5, cur).scale).toBeCloseTo((7.5 * W) / 200, 9)
  // só o deslocamento horizontal conta: clicar mais alto ou mais baixo no lado do hex dá a mesma escala
  expect(scaleFromPoints([0, 0], [300, 400], 10, cur).scale).toBeCloseTo((10 * W) / 300, 9)
  expect(scaleFromPoints([300, 0], [0, 99], 10, cur).scale).toBeCloseTo((10 * W) / 300, 9)
})

test('scaleFromPoints: entradas inválidas devolvem cur; escala é limitada', () => {
  const cur = { x: 1, y: 2, scale: 3 }
  for (const [p2, h] of [[[5, 5], 0], [[5, 5], -1], [[5, 5], NaN], [[5, 5], Infinity], [[0, 0], 5]] as const)
    expect(scaleFromPoints([0, 0], [...p2], h, cur)).toBe(cur)
  expect(scaleFromPoints([0, 0], [1, 0], 1000, cur).scale).toBe(20)
  expect(scaleFromPoints([0, 0], [1e9, 0], 1, cur).scale).toBe(0.02)
})

test('anchorScale mantém o ponto de mundo fixo e limita a escala', () => {
  const bg = { x: 100, y: -50, scale: 2 }
  // ponto (300, 150) do mundo = px (100, 100) da imagem; fator 1.5 -> scale 3
  expect(anchorScale(bg, 1.5, 300, 150)).toEqual({ x: 0, y: -150, scale: 3 })
  expect(anchorScale(bg, 1, 7, 9)).toEqual(bg)
  expect(anchorScale(bg, 1000, 300, 150).scale).toBe(20)
  expect(anchorScale(bg, 1e-9, 300, 150).scale).toBe(0.02)
})

test('bgCovers', () => {
  const d = emptyDoc()
  const [w, h] = mapBounds(d)
  const bg = { key: 'k', src: '', w, h, x: MAP_ORIGIN[0], y: MAP_ORIGIN[1], scale: 1, opacity: 1 }
  expect(bgCovers(bg, d)).toBe(true)
  expect(bgCovers({ ...bg, w: w - 1 }, d)).toBe(false)
  expect(bgCovers({ ...bg, h: h - 1 }, d)).toBe(false)
  expect(bgCovers({ ...bg, x: bg.x + 1 }, d)).toBe(false)
})

test('fitBgToMap cobre o mapa sem distorcer e centraliza', () => {
  const d = emptyDoc()
  for (const [w, h] of [[1000, 500], [500, 1000], [4000, 3000], [300, 300]]) {
    const bg = { key: 'k', src: '', w, h, x: 7, y: 9, scale: 1, opacity: 1 }
    const f = fitBgToMap(bg, d)
    expect(bgCovers({ ...bg, ...f }, d)).toBe(true)
    // centralizada: sobra igual dos dois lados nos dois eixos
    const [mw, mh] = mapBounds(d)
    expect(f.x - MAP_ORIGIN[0] + (f.x + w * f.scale - MAP_ORIGIN[0] - mw)).toBeCloseTo(0, 6)
    expect(f.y - MAP_ORIGIN[1] + (f.y + h * f.scale - MAP_ORIGIN[1] - mh)).toBeCloseTo(0, 6)
  }
})

test('fitMapToBg reduz colunas/linhas à imagem, só diminui e respeita o mínimo', () => {
  const d = emptyDoc() // 30x20
  const W = SIZE * Math.sqrt(3)
  const bg = { key: 'k', src: '', w: W * 10.5 + 0.01, h: SIZE * (1.5 * 8 + 0.5) + 0.01, x: MAP_ORIGIN[0] + 50, y: MAP_ORIGIN[1] + 20, scale: 1, opacity: 1 }
  const f = fitMapToBg(bg, d)
  expect([f.cols, f.rows, f.x, f.y]).toEqual([10, 8, MAP_ORIGIN[0], MAP_ORIGIN[1]]) // encosta na origem
  expect(bgCovers({ ...bg, x: f.x, y: f.y }, { ...d, cols: f.cols, rows: f.rows })).toBe(true)
  // imagem maior que o mapa: não aumenta
  expect(fitMapToBg({ ...bg, w: 1e6, h: 1e6, x: MAP_ORIGIN[0], y: MAP_ORIGIN[1] }, d)).toMatchObject({ cols: 30, rows: 20 })
  // imagem minúscula: mínimo 5
  expect(fitMapToBg({ ...bg, w: 10, h: 10 }, d)).toMatchObject({ cols: 5, rows: 5 })
})

test('hexDistance', () => {
  expect(hexDistance('0,0', '3,0')).toBe(3)
  expect(hexDistance('2,2', '2,2')).toBe(0)
  for (const [c, r] of [[2, 2], [2, 3]]) for (const [nc, nr] of neighbors(c, r)) expect(hexDistance(key(c, r), key(nc, nr))).toBe(1)
})

test('hexLine: grade 6x6, todos os pares', () => {
  const ks = Array.from({ length: 36 }, (_, i) => key(i % 6, Math.floor(i / 6)))
  for (const a of ks)
    for (const b of ks) {
      const l = hexLine(a, b)
      expect(l.length).toBe(hexDistance(a, b) + 1)
      expect(l[0]).toBe(a)
      expect(l.at(-1)).toBe(b)
      for (let i = 1; i < l.length; i++) expect(isNeighbor(l[i - 1], l[i])).toBe(true)
    }
})
