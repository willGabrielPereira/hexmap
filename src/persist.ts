import { normalizeIcon } from './icons'
import { mapBounds, draw } from './render'
import { emptyDoc } from './store'
import type { MapDoc } from './types'

const LS = 'hexmap:doc'

export function isDoc(x: any): x is MapDoc {
  return x?.v === 1 && Number.isInteger(x.cols) && Number.isInteger(x.rows)
    && x.hexes && typeof x.hexes === 'object' && Array.isArray(x.lines)
}

// ids de ícone antigos (emoji) -> ids novos
export const migrate = (d: MapDoc): MapDoc => ({
  ...d,
  hexes: Object.fromEntries(Object.entries(d.hexes).map(([k, h]) => [k, h.icon ? { ...h, icon: normalizeIcon(h.icon) } : h])),
})

export function loadLocal(): MapDoc {
  try {
    const d = JSON.parse(localStorage.getItem(LS) ?? 'null')
    if (isDoc(d)) return migrate(d)
  } catch { /* storage indisponível ou JSON inválido */ }
  return emptyDoc()
}

export const saveLocal = (d: MapDoc) => {
  try { localStorage.setItem(LS, JSON.stringify(d)) } catch { /* cota cheia */ }
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

export const saveFile = (d: MapDoc) =>
  download(new Blob([JSON.stringify(d)], { type: 'application/json' }), 'hexmap.json')

export async function loadFile(f: File): Promise<MapDoc> {
  const d = JSON.parse(await f.text())
  if (!isDoc(d)) throw new Error('Arquivo não é um mapa válido')
  return migrate(d)
}

export function exportPng(d: MapDoc) {
  const [w, h] = mapBounds(d)
  const cv = document.createElement('canvas')
  cv.width = Math.ceil(w)
  cv.height = Math.ceil(h)
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, cv.width, cv.height)
  draw(ctx, d, { x: Math.sqrt(3) * 20, y: 40, zoom: 1 })
  cv.toBlob((b) => b && download(b, 'hexmap.png'))
}
