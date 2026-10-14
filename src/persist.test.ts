import { beforeEach, expect, test } from 'vitest'
import {
  _resetPersist, gcKeys, joinBg, loadFile, loadLocal, localDoc, migrate, parseStored, saveLocal, splitBg, withTimeout,
  type Io, type Kv,
} from './persist'
import { emptyDoc } from './store'
import type { Bg, MapDoc, MapDocV1 } from './types'

const v1: MapDocV1 = {
  v: 1, cols: 10, rows: 8,
  hexes: { '0,0': { terrain: 'forest', icon: '🏰', label: 'X' } },
  lines: [{ a: '0,0', b: '1,0', kind: 'river' }],
}

// doc v2 com campos inválidos aplicados por cima de um doc válido
const bad = (patch: object, hex?: object) =>
  migrate({ ...emptyDoc(), ...(hex && { hexes: { '0,0': hex } }), ...patch } as MapDoc)

test('migração v1 -> v2', () => {
  const d = migrate(v1)
  expect(d.v).toBe(2)
  expect([d.cols, d.rows]).toEqual([10, 8])
  expect(d.lines).toEqual(v1.lines)
  expect(d.hexes['0,0']).toEqual({ terrain: 'forest', icon: 'castle', label: 'X' })
  expect(d.terrains.forest.color).toBe('#4a8f5a')
  expect(d.terrains.street.cost).toBe(0.5)
})

test('parseStored: válido migra; ilegível volta em bad; null é vazio sem bad', () => {
  const v2: MapDoc = {
    ...emptyDoc(), hexes: { '1,1': { terrain: 'rubble', icon: 'ruin', note: 'n', secret: { icon: 'trap', label: 's' } } },
    style: 'tint', scale: { value: 2, unit: 'km' },
  }
  expect(parseStored(JSON.stringify(v2))).toEqual({ doc: v2 })
  expect(parseStored(JSON.stringify(v1)).doc).toEqual(migrate(v1))
  expect(parseStored('{lixo')).toEqual({ doc: emptyDoc(), bad: '{lixo' })
  expect(parseStored('{"v":3}').bad).toBe('{"v":3}')
  expect(parseStored(null)).toEqual({ doc: emptyDoc() })
})

test('migrate valida a fronteira', () => {
  const def = emptyDoc()
  for (const cost of [NaN, 'x', -1, 0]) {
    expect(bad({ terrains: { a: { name: 'A', color: '#000', cost } } }).terrains.a.cost).toBe(1)
  }
  expect(bad({ terrains: 5 }).terrains).toEqual(def.terrains)
  expect(bad({ terrains: {} }).terrains).toEqual(def.terrains)
  expect(bad({ terrains: { a: { name: 3, color: '#000', cost: 1 }, b: { name: 'B', color: '#111', cost: 2 } } }).terrains)
    .toEqual({ b: { name: 'B', color: '#111', cost: 2 } })
  expect(bad({ icons: { a: { name: 'A', glyph: 'nao-existe' } } }).icons.a.glyph).toBe('question')
  expect(bad({ icons: { a: { name: 'A', glyph: 'toString' } } }).icons.a.glyph).toBe('question')
  expect(bad({}, { label: 'L', note: {} }).hexes['0,0']).toEqual({ label: 'L' })
  expect(bad({}, { label: 'L', secret: 'x' }).hexes['0,0']).toEqual({ label: 'L' })
  expect(bad({}, { secret: { label: 5 } }).hexes).toEqual({})
  expect(bad({}, { secret: { icon: '💀' } }).hexes['0,0']).toEqual({ secret: { icon: 'skull' } })
  expect('scale' in bad({ scale: { value: 0, unit: 'h' } })).toBe(false)
  expect('style' in bad({ style: 'neon' })).toBe(false)
  expect(bad({ hexOpacity: 0.3 }).hexOpacity).toBe(0.3)
  for (const v of [2, -1, NaN, '0.5']) expect('hexOpacity' in bad({ hexOpacity: v })).toBe(false)
  const bg = { key: 'k', src: 'data:image/png;base64,AA', w: 10, h: 10, x: 0, y: 0, scale: 1, opacity: 0.5 }
  expect(bad({ bg }).bg).toEqual(bg)
  expect(bad({ bg: { ...bg, src: 'javascript:x' } }).bg).toBeUndefined()
  expect(bad({ bg: { ...bg, scale: NaN } }).bg).toBeUndefined()
  expect(bad({ bg: { ...bg, opacity: 2 } }).bg).toBeUndefined()
  expect(bad({ lines: [{ a: '0,0', b: '1,0', kind: 'river' }, { a: 1 }, null] }).lines).toEqual([{ a: '0,0', b: '1,0', kind: 'river' }])
})

// --- Fase 2: fundo no IndexedDB ---
const LS = 'hexmap:doc'
const bgOf = (key: string, extra: Partial<Bg> = {}): Bg =>
  ({ key, src: 'data:image/png;base64,' + key, w: 10, h: 10, x: 0, y: 0, scale: 1, opacity: 0.6, ...extra })
const withBg = (key: string, extra?: Partial<Bg>): MapDoc => ({ ...emptyDoc(), bg: bgOf(key, extra) })
const flush = () => new Promise((r) => setTimeout(r, 0))

// Kv falso: um Map + puts resolvidos manualmente; ls falso em memória
function fake(blobs: Record<string, string> = {}) {
  const m = new Map(Object.entries(blobs))
  const calls: string[] = []
  const puts: { key: string; ok(): void; fail(): void }[] = []
  const store: Record<string, string> = {}
  const warns: string[] = []
  const kv: Kv = {
    get: async (k) => { calls.push('get ' + k); return m.has(k) ? { key: k, src: m.get(k)! } : undefined },
    put: (src, k) => {
      calls.push('put ' + k)
      return new Promise((res) => puts.push({ key: k, ok: () => { m.set(k, src); res(undefined) }, fail: () => res('timeout') }))
    },
    keys: async () => { calls.push('keys'); return [...m.keys()] },
    del: async (k) => { calls.push('del ' + k); m.delete(k) },
  }
  const io: Io = { kv, ls: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v } }, warn: (w) => { warns.push(w) } }
  const stored = () => JSON.parse(store[LS]) as MapDoc
  // resolve o put mais recente da chave
  const resolve = async (key: string, ok = true) => {
    const p = puts.findLast((x) => x.key === key)!
    if (ok) p.ok()
    else p.fail()
    await flush()
  }
  return { m, calls, puts, store, warns, kv, io, stored, resolve }
}
// localStorage como o boot o encontra (doc sem src)
const lsWith = (f: ReturnType<typeof fake>, d: MapDoc) => { f.store[LS] = JSON.stringify(splitBg(d).doc) }

beforeEach(() => _resetPersist())

test('withTimeout', async () => {
  expect(await withTimeout(new Promise(() => {}), 10, 'x')).toBe('x')
  expect(await withTimeout(Promise.reject(new Error('e')), 1000, 'x')).toBe('x')
  expect(await withTimeout(Promise.resolve(1), 1000, 0)).toBe(1)
})

test('splitBg', () => {
  const d = withBg('K')
  const s = splitBg(d)
  expect(s.doc.bg!.src).toBe('')
  expect(s.src).toBe(d.bg!.src)
  expect(d.bg!.src).not.toBe('') // não muta o original
  expect(splitBg(withBg('K', { src: '' })).src).toBeUndefined() // nada de put('')
  expect(splitBg(emptyDoc()).src).toBeUndefined()
})

test('joinBg', () => {
  const d = splitBg(withBg('K')).doc
  expect(joinBg(d, { key: 'K', src: 'data:image/png;base64,Z' }).doc.bg!.src).toBe('data:image/png;base64,Z')
  expect(joinBg(d, 'timeout')).toEqual({ doc: d })
  expect(joinBg(d, undefined).doc.bg).toBeUndefined()
  expect(joinBg(d, undefined).missing).toBe(true)
  const other = joinBg(d, { key: 'L', src: 'data:image/png;base64,Z' })
  expect(other.doc.bg).toBeUndefined()
  expect(other.missing).toBe(true)
  expect(joinBg(emptyDoc(), undefined)).toEqual({ doc: emptyDoc() })
})

test('localDoc só referencia chaves confirmadas', () => {
  const docK2 = splitBg(withBg('K2', { opacity: 0.3 })).doc, bgK1 = splitBg(withBg('K1')).doc.bg!
  expect(localDoc(docK2, new Set(['K1']), bgK1).bg!.key).toBe('K1')
  expect(localDoc(docK2, new Set(['K1', 'K2']), bgK1).bg).toEqual(docK2.bg)
  expect(localDoc(emptyDoc(), new Set(['K1']), bgK1).bg).toBeUndefined()
  expect(localDoc(docK2, new Set(), undefined).bg).toBeUndefined()
})

test('gcKeys', () => {
  expect(gcKeys(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  expect(gcKeys(['a'], undefined)).toEqual(['a'])
  expect(gcKeys([], 'x')).toEqual([])
})

test('saveLocal (a): corrida de undo, nas duas ordens', async () => {
  for (const order of [['K2', 'K1'], ['K1', 'K2']]) {
    _resetPersist()
    const f = fake()
    saveLocal(withBg('K1'), f.io) // upload K1, put pendente
    expect(f.stored().bg).toBeUndefined() // nada confirmado ainda
    saveLocal(withBg('K2'), f.io) // upload K2, put pendente
    saveLocal(withBg('K1'), f.io) // undo para K1: K1 já está em pending, sem novo put
    expect(f.puts.map((p) => p.key)).toEqual(['K1', 'K2'])
    for (const k of order) await f.resolve(k)
    expect(f.stored().bg!.key).toBe('K1')
    expect(f.stored().bg!.src).toBe('')
    expect(f.m.has('K1')).toBe(true)
  }
})

test('saveLocal (b): edição durante o put não se perde', async () => {
  const f = fake()
  saveLocal(withBg('K2'), f.io)
  saveLocal(withBg('K2', { opacity: 0.3 }), f.io)
  await f.resolve('K2')
  expect(f.stored().bg!.key).toBe('K2')
  expect(f.stored().bg!.opacity).toBe(0.3)
})

test('saveLocal (c): dedup', async () => {
  const f = fake()
  saveLocal(withBg('K'), f.io)
  saveLocal(withBg('K'), f.io)
  expect(f.puts.length).toBe(1)
  await f.resolve('K')
  saveLocal(withBg('K', { x: 5 }), f.io) // já confirmado
  expect(f.puts.length).toBe(1)
  expect(f.stored().bg!.x).toBe(5)
})

test('saveLocal (d): falha do IDB avisa 1x e mantém o prevBg', async () => {
  const f = fake()
  saveLocal(withBg('K1'), f.io)
  await f.resolve('K1')
  saveLocal(withBg('K2'), f.io)
  await f.resolve('K2', false)
  expect(f.warns).toEqual(['Imagem de fundo não salva automaticamente; use Salvar'])
  expect(f.stored().bg!.key).toBe('K1')
  saveLocal(withBg('K2'), f.io) // a próxima autosave tenta de novo
  expect(f.puts.length).toBe(3)
  await f.resolve('K2', false)
  expect(f.warns.length).toBe(1)
  expect(f.stored().bg!.key).toBe('K1')
})

test('saveLocal (e): sem fundo não toca o IDB', () => {
  const f = fake()
  saveLocal(emptyDoc(), f.io)
  expect(f.calls).toEqual([])
  expect(f.stored()).toEqual(emptyDoc())
})

test('loadLocal: blob presente junta o src e o GC apaga as outras chaves', async () => {
  const f = fake({ K0: 'data:image/png;base64,0', K1: 'data:image/png;base64,1', K9: 'data:image/png;base64,9' })
  lsWith(f, withBg('K1'))
  const r = await loadLocal(f.io)
  expect(r.doc.bg!.src).toBe('data:image/png;base64,1')
  expect(r.missing).toBeUndefined()
  await flush()
  expect([...f.m.keys()]).toEqual(['K1'])
})

test('loadLocal: get com timeout mantém src vazio e não faz GC', async () => {
  const f = fake({ K0: 'x' })
  f.kv.get = async () => 'timeout'
  lsWith(f, withBg('K1'))
  const r = await loadLocal(f.io)
  expect(r.doc.bg!.key).toBe('K1')
  expect(r.doc.bg!.src).toBe('')
  expect(r.missing).toBeUndefined()
  await flush()
  expect(f.calls.filter((c) => c.startsWith('del') || c === 'keys')).toEqual([])
  // chave presumida confirmada: o autosave da sessão continua referenciando K1, sem put('')
  saveLocal({ ...r.doc, bg: { ...r.doc.bg!, opacity: 0.2 } }, f.io)
  expect(f.stored().bg!.key).toBe('K1')
  expect(f.puts.length).toBe(0)
})

test('loadLocal: chave ausente -> missing, GC apaga tudo e o ls é regravado sem bg', async () => {
  const f = fake({ X: 'data:image/png;base64,X' })
  lsWith(f, withBg('K1'))
  const r = await loadLocal(f.io)
  expect(r.missing).toBe(true)
  expect(r.doc.bg).toBeUndefined()
  expect(f.stored().bg).toBeUndefined()
  await flush()
  expect(f.m.size).toBe(0)
})

test('loadLocal: keys() com timeout não apaga nada', async () => {
  const f = fake({ K0: 'x', K1: 'data:image/png;base64,1' })
  f.kv.keys = async () => 'timeout'
  lsWith(f, withBg('K1'))
  await loadLocal(f.io)
  await flush()
  expect(f.calls.filter((c) => c.startsWith('del'))).toEqual([])
  expect(f.m.size).toBe(2)
})

test('loadLocal: sem bg o GC limpa blobs órfãos', async () => {
  const f = fake({ K0: 'x' })
  lsWith(f, emptyDoc())
  await loadLocal(f.io)
  await flush()
  expect(f.m.size).toBe(0)
})

test('regressão: K1 ok -> K2 pendente -> remover fundo -> undo para K2 -> ls mostra K1', async () => {
  const f = fake({ K1: 'data:image/png;base64,1' })
  lsWith(f, withBg('K1'))
  await loadLocal(f.io)
  await flush()
  saveLocal(withBg('K2'), f.io)
  expect(f.stored().bg!.key).toBe('K1')
  saveLocal(emptyDoc(), f.io)
  expect(f.stored().bg).toBeUndefined()
  saveLocal(withBg('K2'), f.io)
  expect(f.stored().bg!.key).toBe('K1')
  expect(f.puts.length).toBe(1)
  await f.resolve('K2')
  expect(f.stored().bg!.key).toBe('K2')
})

test('loadFile: preserva bg com src; descarta bg sem src ou inválido', async () => {
  const file = (d: object) => new File([JSON.stringify(d)], 'm.json')
  const d = withBg('K')
  expect((await loadFile(file(d))).bg).toEqual(d.bg)
  expect((await loadFile(file(withBg('K', { src: '' })))).bg).toBeUndefined()
  expect((await loadFile(file(withBg('K', { src: 'javascript:x' })))).bg).toBeUndefined()
  expect((await loadFile(file({ ...d, bg: { ...d.bg, scale: NaN } }))).bg).toBeUndefined()
})

test('B1: v2 da Fase 1 lido do localStorage é preservado', () => {
  const v2: MapDoc = { ...withBg('K', { src: '' }), style: 'outline', hexes: { '0,0': { terrain: 'street', note: 'n' } } }
  expect(parseStored(JSON.stringify(v2))).toEqual({ doc: v2 })
})
