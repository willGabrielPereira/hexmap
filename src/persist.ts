import { DEFAULT_ICONS, GLYPHS, normalizeIcon } from './icons'
import { mapBounds, draw, type DrawOpts } from './render'
import { emptyDoc, notesMarkdown } from './store'
import { DEFAULT_TERRAINS } from './palette'
import type { Bg, Edge, Hex, IconDef, Item, MapDoc, MapDocV1, Terrain } from './types'

const LS = 'hexmap:doc'

function isDocLike(x: any): x is MapDocV1 | MapDoc {
  return (x?.v === 1 || x?.v === 2) && Number.isInteger(x.cols) && Number.isInteger(x.rows)
    && !!x.hexes && typeof x.hexes === 'object' && Array.isArray(x.lines)
}

// --- validação na fronteira: campo inválido = ausente (o leitor aplica o default) ---
const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x)
const isStr = (x: unknown): x is string => typeof x === 'string'
const fin = (x: unknown): x is number => Number.isFinite(x)

const cleanTerrain = (e: any): Terrain | undefined =>
  isStr(e.name) && isStr(e.color) ? { name: e.name, color: e.color, cost: fin(e.cost) && e.cost > 0 ? e.cost : 1 } : undefined

const cleanIcon = (e: any): IconDef | undefined => isStr(e.name)
  ? { name: e.name, glyph: isStr(e.glyph) && Object.hasOwn(GLYPHS, e.glyph) ? e.glyph : 'question', ...(isStr(e.color) && { color: e.color }) }
  : undefined

// catálogo ausente, inválido ou vazio -> default (validTool nunca fica sem item)
function cleanCatalog<T>(x: unknown, def: Record<string, T>, clean: (e: any) => T | undefined): Record<string, T> {
  const out: Record<string, T> = {}
  if (isObj(x)) for (const [k, e] of Object.entries(x)) {
    const v = isObj(e) ? clean(e) : undefined
    if (v) out[k] = v
  }
  return Object.keys(out).length ? out : { ...def }
}

function cleanHex(h: unknown): Hex | undefined {
  if (!isObj(h)) return
  const out: Hex = {}
  for (const f of ['terrain', 'icon', 'label', 'note'] as const) if (isStr(h[f])) out[f] = h[f]
  if (out.icon) out.icon = normalizeIcon(out.icon) // ids antigos (emoji) -> ids novos
  if (isObj(h.secret)) {
    const s: Item = {}
    if (isStr(h.secret.icon)) s.icon = normalizeIcon(h.secret.icon)
    if (isStr(h.secret.label)) s.label = h.secret.label
    if (Object.keys(s).length) out.secret = s
  }
  return Object.keys(out).length ? out : undefined
}

const cleanBg = (b: any): Bg | undefined =>
  isObj(b) && isStr(b.key) && isStr(b.src) && (b.src === '' || b.src.startsWith('data:image/'))
    && [b.x, b.y, b.scale, b.w, b.h].every(fin) && b.scale > 0 && fin(b.opacity) && b.opacity >= 0 && b.opacity <= 1
    ? { key: b.key, src: b.src, w: b.w, h: b.h, x: b.x, y: b.y, scale: b.scale, opacity: b.opacity }
    : undefined

const isEdge = (l: any): l is Edge => isObj(l) && isStr(l.a) && isStr(l.b) && (l.kind === 'river' || l.kind === 'road')

export function migrate(d: MapDocV1 | MapDoc): MapDoc {
  const x = d as any
  const hexes: Record<string, Hex> = {}
  for (const [k, h] of Object.entries(x.hexes)) {
    const c = cleanHex(h)
    if (c) hexes[k] = c
  }
  const out: MapDoc = {
    v: 2, cols: x.cols, rows: x.rows, hexes, lines: x.lines.filter(isEdge),
    terrains: cleanCatalog(x.terrains, DEFAULT_TERRAINS, cleanTerrain),
    icons: cleanCatalog(x.icons, DEFAULT_ICONS, cleanIcon),
  }
  const bg = cleanBg(x.bg)
  if (bg) out.bg = bg
  if (x.style === 'solid' || x.style === 'tint' || x.style === 'outline') out.style = x.style
  if (fin(x.hexOpacity) && x.hexOpacity >= 0 && x.hexOpacity <= 1) out.hexOpacity = x.hexOpacity
  if (isObj(x.scale) && fin(x.scale.value) && x.scale.value > 0 && isStr(x.scale.unit)) out.scale = { value: x.scale.value, unit: x.scale.unit }
  return out
}

// nunca descarta em silêncio: conteúdo ilegível volta em `bad` para ser guardado
export function parseStored(raw: string | null): { doc: MapDoc; bad?: string } {
  if (raw === null) return { doc: emptyDoc() }
  try {
    const d = JSON.parse(raw)
    if (isDocLike(d)) return { doc: migrate(d) }
  } catch { /* JSON inválido */ }
  return { doc: emptyDoc(), bad: raw }
}

// --- imagem de fundo: doc sem src no localStorage + dataURL no IndexedDB, na chave bg.key ---
export const withTimeout = <T, F>(p: Promise<T>, ms: number, fallback: F): Promise<T | F> =>
  Promise.race([p.catch(() => fallback), new Promise<F>((ok) => setTimeout(() => ok(fallback), ms))])

type Got = { key: string; src: string } | undefined
// 'timeout' = timeout ou erro; put/del resolvem com qualquer outro valor em caso de sucesso
export type Kv = {
  get(k: string): Promise<Got | 'timeout'>
  put(src: string, k: string): Promise<unknown>
  keys(): Promise<string[] | 'timeout'>
  del(k: string): Promise<unknown>
}

let db: Promise<IDBDatabase> | undefined // lazy: nada toca indexedDB no import (testes em node)
const openDb = () => db ??= new Promise((ok, no) => {
  const r = indexedDB.open('hexmap', 1)
  r.onupgradeneeded = () => r.result.createObjectStore('img')
  r.onsuccess = () => ok(r.result)
  r.onerror = () => no(r.error)
})
// transações são criadas na ordem das chamadas (mesma conexão memoizada); o GC do boot depende disso para rodar depois do get
const run = <T,>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>, ms: number) =>
  withTimeout(openDb().then((d) => new Promise<T>((ok, no) => {
    const tx = d.transaction('img', mode)
    const r = op(tx.objectStore('img'))
    tx.oncomplete = () => ok(r.result)
    tx.onerror = tx.onabort = () => no(tx.error)
  })), ms, 'timeout' as const)

const idbKv: Kv = {
  get: (k) => run('readonly', (s) => s.get(k), 2000).then((v) => v === 'timeout' ? v : typeof v === 'string' ? { key: k, src: v } : undefined),
  put: (src, k) => run('readwrite', (s) => s.put(src, k), 30000), // dataURL grande pode demorar; não desistir em 2 s
  keys: () => run('readonly', (s) => s.getAllKeys(), 2000).then((v) => v === 'timeout' ? v : v.map(String)),
  del: (k) => run('readwrite', (s) => s.delete(k), 2000),
}

export type Io = { kv: Kv; ls: Pick<Storage, 'getItem' | 'setItem'>; warn(msg: string): void }
let persistWarn: (msg: string) => void = () => {}
export const setPersistWarn = (cb: (msg: string) => void) => { persistWarn = cb }
const defaultIo: Io = {
  kv: idbKv,
  ls: { getItem: (k) => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v) }, // acessado no uso
  warn: (m) => persistWarn(m),
}

export function splitBg(d: MapDoc): { doc: MapDoc; src?: string } {
  if (!d.bg) return { doc: d }
  return { doc: { ...d, bg: { ...d.bg, src: '' } }, src: d.bg.src || undefined }
}

const noBg = (d: MapDoc): MapDoc => {
  const { bg: _, ...rest } = d
  return rest
}

// 'timeout': mantém bg com src '' nesta sessão; ausente ou outra chave: descarta bg
export function joinBg(doc: MapDoc, got: Got | 'timeout'): { doc: MapDoc; missing?: true } {
  if (!doc.bg || got === 'timeout') return { doc }
  if (got?.key === doc.bg.key) return { doc: { ...doc, bg: { ...doc.bg, src: got.src } } }
  return { doc: noBg(doc), missing: true }
}

// o localStorage só referencia chaves com blob confirmado; put pendente/falho -> último bg confirmado
export function localDoc(doc: MapDoc, okKeys: Set<string>, prevBg?: Bg): MapDoc {
  if (!doc.bg || okKeys.has(doc.bg.key)) return doc
  return prevBg ? { ...doc, bg: prevBg } : noBg(doc)
}

export const gcKeys = (all: string[], keep?: string) => all.filter((k) => k !== keep)

// estado da sessão. Nenhuma chave é apagada durante a sessão (GC só no boot), então okKeys continua válido.
let okKeys = new Set<string>() // blob confirmado no IDB
let pending = new Set<string>() // put em voo (dedup)
let prevBg: Bg | undefined // último bg (sem src) com chave em okKeys
let lastDoc: MapDoc | undefined // doc mais recente (sem src)
let warned = false
export const _resetPersist = () => {
  okKeys = new Set(); pending = new Set(); prevBg = lastDoc = undefined; warned = false
}

// GC só no boot, sem await (não atrasa o render); no boot não há put pendente
const gc = (io: Io, keep?: string) => void io.kv.keys().then((all) => {
  if (all === 'timeout') return
  for (const k of gcKeys(all, keep)) io.kv.del(k)
})

// ponytail: sem lock entre abas (vence a última gravação); usar evento storage/BroadcastChannel se virar problema
// ponytail: um build antigo lê v2 como inválido e sobrescreve; salvar o JSON antes de voltar de versão
export async function loadLocal(io: Io = defaultIo): Promise<{ doc: MapDoc; bad?: string; missing?: true }> {
  let raw: string | null = null
  try { raw = io.ls.getItem(LS) } catch { /* storage indisponível */ }
  const r = parseStored(raw)
  if (r.bad !== undefined) try { io.ls.setItem(LS + ':bad', r.bad) } catch { /* cota cheia */ }
  const bg = r.doc.bg
  if (!bg) { gc(io); return r }
  if (bg.src) return r // legado (Fase 1 gravava o src no localStorage): a próxima autosave faz o put
  const got = await io.kv.get(bg.key)
  const { doc, missing } = joinBg(r.doc, got)
  if (missing) { // regrava sem bg para o toast não se repetir a cada reload
    try { io.ls.setItem(LS, JSON.stringify(doc)) } catch { /* cota cheia */ }
    gc(io)
    return { doc, missing }
  }
  okKeys.add(bg.key) // no timeout, presumido
  prevBg = bg
  if (got !== 'timeout') gc(io, bg.key) // timeout: sem GC (o blob pode existir)
  return { doc }
}

export function saveLocal(d: MapDoc, io: Io = defaultIo) {
  const { doc, src } = splitBg(d)
  lastDoc = doc
  if (doc.bg && okKeys.has(doc.bg.key)) prevBg = doc.bg // sem bg: mantém (localDoc já grava sem bg)
  const write = () => {
    try { io.ls.setItem(LS, JSON.stringify(localDoc(lastDoc!, okKeys, prevBg))) } catch { /* cota cheia */ }
  }
  write()
  const key = doc.bg?.key
  if (!src || key === undefined || okKeys.has(key) || pending.has(key)) return
  pending.add(key)
  io.kv.put(src, key).then((res) => {
    pending.delete(key)
    if (res === 'timeout') { // a próxima autosave tenta de novo
      if (!warned) { warned = true; io.warn('Imagem de fundo não salva automaticamente; use Salvar') }
      return
    }
    okKeys.add(key)
    if (lastDoc?.bg?.key === key) prevBg = lastDoc.bg
    write() // usa lastDoc, nunca o doc da closure: edições feitas durante o put não se perdem
  })
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

// bg com src '' (sessão com timeout) nunca vai ao arquivo: o App confirma antes ("Salvar sem a imagem de fundo?")
export const saveFile = (d: MapDoc) =>
  download(new Blob([JSON.stringify(d.bg?.src === '' ? noBg(d) : d)], { type: 'application/json' }), 'hexmap.json')

export async function loadFile(f: File): Promise<MapDoc> {
  const d = JSON.parse(await f.text())
  if (!isDocLike(d)) throw new Error('Arquivo não é um mapa válido')
  const m = migrate(d)
  return m.bg && !m.bg.src ? noBg(m) : m // um JSON precisa embutir a imagem
}

export const saveNotes = (d: MapDoc) =>
  download(new Blob([notesMarkdown(d)], { type: 'text/markdown' }), 'hexmap-notas-mestre.md')

// decode() pode rejeitar: os chamadores mostram o erro. Recebe o doc já filtrado (filterDoc); secrets só na versão do mestre
export async function exportPng(d: MapDoc, o: Pick<DrawOpts, 'grid' | 'secrets'> = {}) {
  let img: HTMLImageElement | undefined
  if (d.bg?.src) {
    img = new Image()
    img.src = d.bg.src
    await img.decode()
  }
  const [w, h] = mapBounds(d)
  const cv = document.createElement('canvas')
  cv.width = Math.ceil(w)
  cv.height = Math.ceil(h)
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, cv.width, cv.height)
  draw(ctx, d, { x: Math.sqrt(3) * 20, y: 40, zoom: 1 }, { img, grid: o.grid, secrets: o.secrets })
  cv.toBlob((b) => b && download(b, 'hexmap.png'))
}
