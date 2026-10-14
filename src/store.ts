import type { MapDoc } from './types'
import { isNeighbor } from './hex'

export const emptyDoc = (): MapDoc => ({ v: 1, cols: 30, rows: 20, hexes: {}, lines: [] })

export type State = { doc: MapDoc; past: MapDoc[]; future: MapDoc[] }
export type Action =
  | { t: 'snap' } // empurra o estado atual p/ undo; chamar uma vez por gesto
  | { t: 'edit'; fn: (d: MapDoc) => MapDoc }
  | { t: 'undo' | 'redo' }
  | { t: 'load'; doc: MapDoc }

export const init = (doc: MapDoc): State => ({ doc, past: [], future: [] })

export function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'snap':
      return { ...s, past: [...s.past.slice(-99), s.doc], future: [] }
    case 'edit':
      return { ...s, doc: a.fn(s.doc) }
    case 'undo':
      return s.past.length
        ? { doc: s.past.at(-1)!, past: s.past.slice(0, -1), future: [...s.future, s.doc] }
        : s
    case 'redo':
      return s.future.length
        ? { doc: s.future.at(-1)!, past: [...s.past, s.doc], future: s.future.slice(0, -1) }
        : s
    case 'load':
      return { doc: a.doc, past: [...s.past, s.doc], future: [] }
  }
}

// edições puras (doc -> doc)
export const setHex = (k: string, patch: object | null) => (d: MapDoc): MapDoc => {
  const hexes = { ...d.hexes }
  if (patch) hexes[k] = { ...hexes[k], ...patch }
  else delete hexes[k]
  const lines = patch ? d.lines : d.lines.filter((l) => l.a !== k && l.b !== k)
  return { ...d, hexes, lines }
}

export const toggleLine = (a: string, b: string, kind: 'river' | 'road') => (d: MapDoc): MapDoc => {
  if (!isNeighbor(a, b)) return d
  const same = (l: MapDoc['lines'][number]) =>
    l.kind === kind && ((l.a === a && l.b === b) || (l.a === b && l.b === a))
  return { ...d, lines: d.lines.some(same) ? d.lines.filter((l) => !same(l)) : [...d.lines, { a, b, kind }] }
}

// novo tamanho; descarta hexes/linhas que ficam fora do mapa (undo restaura)
export const resize = (cols: number, rows: number) => (d: MapDoc): MapDoc => {
  const inside = (k: string) => { const [c, r] = k.split(',').map(Number); return c < cols && r < rows }
  return {
    ...d, cols, rows,
    hexes: Object.fromEntries(Object.entries(d.hexes).filter(([k]) => inside(k))),
    lines: d.lines.filter((l) => inside(l.a) && inside(l.b)),
  }
}
