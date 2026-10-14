import type { Hex, IconDef, Item, Layers, MapDoc, Terrain } from './types'
import { isNeighbor, parse } from './hex'
import { DEFAULT_ICONS } from './icons'
import { DEFAULT_TERRAINS } from './palette'

export const emptyDoc = (): MapDoc => ({
  v: 2, cols: 30, rows: 20, hexes: {}, lines: [], terrains: { ...DEFAULT_TERRAINS }, icons: { ...DEFAULT_ICONS },
})

// sem crypto.randomUUID: só existe em contexto seguro (https/localhost)
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

// autosave: o doc carregado só é gravado depois da 1ª edição (não sobrescreve o que não se entendeu)
export const shouldSave = (touched: boolean, doc: MapDoc, initial: MapDoc) => touched || doc !== initial

type State = { doc: MapDoc; past: MapDoc[]; future: MapDoc[] }
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

// tira campos undefined; objeto vazio -> undefined
const prune = <T extends object>(h: T): T | undefined => {
  const out = Object.fromEntries(Object.entries(h).filter(([, v]) => v !== undefined)) as T
  return Object.keys(out).length ? out : undefined
}

const mapHexes = (d: MapDoc, fn: (h: Hex) => Hex) => {
  const hexes: Record<string, Hex> = {}
  for (const [k, h] of Object.entries(d.hexes)) {
    const p = prune(fn(h))
    if (p) hexes[k] = p
  }
  return hexes
}

// limpa terreno/ícone/rótulo; preserva nota e segredo; remove as linhas do hex
export const eraseHex = (k: string) => (d: MapDoc): MapDoc => {
  const hexes = { ...d.hexes }
  const h = prune({ ...hexes[k], terrain: undefined, icon: undefined, label: undefined })
  if (h) hexes[k] = h
  else delete hexes[k]
  return { ...d, hexes, lines: d.lines.filter((l) => l.a !== k && l.b !== k) }
}

const putHex = (d: MapDoc, k: string, h: Hex): MapDoc => {
  const hexes = { ...d.hexes }
  const p = prune(h)
  if (p) hexes[k] = p
  else delete hexes[k]
  return { ...d, hexes }
}

// merge com o segredo do doc recebido (não do closure); '' remove o campo; null/vazio remove o segredo; hex vazio some
export const setSecret = (k: string, patch: Item | null) => (d: MapDoc): MapDoc => {
  const s = patch ? { ...d.hexes[k]?.secret, ...patch } : {}
  return putHex(d, k, { ...d.hexes[k], secret: prune({ icon: s.icon || undefined, label: s.label || undefined }) })
}

export const setNote = (k: string, text: string) => (d: MapDoc): MapDoc =>
  putHex(d, k, { ...d.hexes[k], note: text.trim() ? text : undefined })

export const ALL: Layers = { bg: true, terrain: true, grid: true, rivers: true, roads: true, icons: true, labels: true, secrets: true }
export const PRESETS = { players: { ...ALL, secrets: false }, gm: ALL }

// lista branca por hex: nota nunca passa; segredo só com a camada pública correspondente ligada
export function filterDoc(d: MapDoc, L: Layers): MapDoc {
  const { bg, ...rest } = d
  const hexes = mapHexes(d, (h) => ({
    terrain: L.terrain ? h.terrain : undefined,
    icon: L.icons ? h.icon : undefined,
    label: L.labels ? h.label : undefined,
    secret: h.secret && prune({
      icon: L.secrets && L.icons ? h.secret.icon : undefined,
      label: L.secrets && L.labels ? h.secret.label : undefined,
    }),
  }))
  const lines = d.lines.filter((l) => (l.kind === 'river' ? L.rivers : L.roads))
  return { ...rest, ...(L.bg && bg && { bg }), hexes, lines }
}

const iconName = (d: MapDoc, id?: string) => (id ? d.icons[id]?.name ?? id : undefined)

// só texto do mestre; nunca entra na imagem
export function notesMarkdown(d: MapDoc): string {
  const rows = Object.entries(d.hexes)
    .filter(([, h]) => h.note || h.secret || h.label)
    .map(([k, h]) => ({ k, h, cr: parse(k) }))
    .sort((a, b) => a.cr[1] - b.cr[1] || a.cr[0] - b.cr[0])
  const out = ['# Notas do mestre']
  for (const { k, h } of rows) {
    out.push('', `## ${k}${h.label ? ` — ${h.label}` : ''}`)
    if (h.secret) out.push(`Segredo: ${[iconName(d, h.secret.icon), h.secret.label].filter(Boolean).join(' ')}`)
    if (h.note) out.push('', h.note)
  }
  return out.join('\n') + '\n'
}

// catálogo: null remove o item e tira o id dos hexes (hex que fica vazio some)
export const setTerrain = (id: string, t: Terrain | null) => (d: MapDoc): MapDoc => {
  if (t) return { ...d, terrains: { ...d.terrains, [id]: t } }
  const { [id]: _, ...terrains } = d.terrains
  return { ...d, terrains, hexes: mapHexes(d, (h) => (h.terrain === id ? { ...h, terrain: undefined } : h)) }
}

export const setIcon = (id: string, def: IconDef | null) => (d: MapDoc): MapDoc => {
  if (def) return { ...d, icons: { ...d.icons, [id]: def } }
  const { [id]: _, ...icons } = d.icons
  return {
    ...d, icons, hexes: mapHexes(d, (h) => ({
      ...h,
      icon: h.icon === id ? undefined : h.icon,
      secret: h.secret?.icon === id ? prune({ ...h.secret, icon: undefined }) : h.secret,
    })),
  }
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

// custo = soma dos hexes ENTRADOS (o 1º não conta); sem terreno ou id inexistente custa 1
export const pathCost = (d: MapDoc, path: string[]): number =>
  path.slice(1).reduce((s, k) => s + (d.terrains[d.hexes[k]?.terrain ?? '']?.cost ?? 1), 0)

export const DEFAULT_SCALE = { value: 1, unit: 'hora' }
const fmtNum = (n: number) => String(Math.round(n * 100) / 100)
// "N hexes · X unidade"; ponytail: só a unidade padrão "hora" é pluralizada (unidade livre não tem plural conhecido)
export const rulerText = (d: MapDoc, path: string[]): string => {
  const { value, unit } = d.scale ?? DEFAULT_SCALE
  const t = pathCost(d, path) * value
  return `${path.length - 1} hexes · ${fmtNum(t)} ${unit === 'hora' && fmtNum(t) !== '1' ? 'horas' : unit}`
}
