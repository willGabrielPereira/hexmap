import { expect, test } from 'vitest'
import { validTool } from './palette'
import {
  ALL, PRESETS, emptyDoc, eraseHex, filterDoc, init, notesMarkdown, pathCost, reducer, rulerText, setHex, setIcon, setNote, setSecret,
  setTerrain, shouldSave, uid,
} from './store'
import type { MapDoc } from './types'

const doc = (): MapDoc => ({
  ...emptyDoc(),
  hexes: {
    '0,0': { terrain: 'forest', icon: 'castle', label: 'X', note: 'n' },
    '1,0': { terrain: 'forest' },
    '2,0': { terrain: 'hills', note: 'nota', secret: { icon: 'trap' } },
  },
  lines: [{ a: '0,0', b: '1,0', kind: 'river' }, { a: '2,0', b: '3,0', kind: 'road' }],
})

test('setTerrain(id, null) tira o terreno do catálogo e dos hexes, mantendo o resto', () => {
  const d = setTerrain('forest', null)(doc())
  expect('forest' in d.terrains).toBe(false)
  expect(d.hexes['0,0']).toEqual({ icon: 'castle', label: 'X', note: 'n' })
  expect('1,0' in d.hexes).toBe(false) // ficou vazio
  expect(d.hexes['2,0'].terrain).toBe('hills')
})

test('setIcon(id, null) tira o ícone público e o secreto', () => {
  const d = setIcon('trap', null)(setIcon('castle', null)(doc()))
  expect(d.hexes['0,0']).toEqual({ terrain: 'forest', label: 'X', note: 'n' })
  expect(d.hexes['2,0']).toEqual({ terrain: 'hills', note: 'nota' })
})

test('eraseHex preserva nota e segredo, remove as linhas do hex e o hex vazio', () => {
  const a = eraseHex('2,0')(doc())
  expect(a.hexes['2,0']).toEqual({ note: 'nota', secret: { icon: 'trap' } })
  expect(a.lines).toEqual([{ a: '0,0', b: '1,0', kind: 'river' }])
  const b = eraseHex('1,0')(doc())
  expect('1,0' in b.hexes).toBe(false)
  expect(b.lines).toEqual([{ a: '2,0', b: '3,0', kind: 'road' }])
})

test('uid gera ids distintos', () => {
  expect(new Set(Array.from({ length: 50 }, uid)).size).toBe(50)
})

test('autosave: nada antes da 1ª edição; depois grava sempre, inclusive undo até o inicial', () => {
  const initial = doc()
  let s = init(initial)
  let touched = shouldSave(false, s.doc, initial)
  expect(touched).toBe(false)
  s = reducer(reducer(s, { t: 'snap' }), { t: 'edit', fn: setHex('5,5', { terrain: 'snow' }) })
  touched = shouldSave(touched, s.doc, initial)
  expect(touched).toBe(true)
  s = reducer(s, { t: 'undo' })
  expect(s.doc).toBe(initial)
  expect(shouldSave(touched, s.doc, initial)).toBe(true)
})

// mesmo hex: Edifício + "Ruína" pública + armadilha secreta + nota
const gmDoc = (): MapDoc => ({
  ...doc(),
  bg: { key: 'k', src: 'data:image/png;base64,AA', w: 10, h: 10, x: 0, y: 0, scale: 1, opacity: 1 },
  hexes: {
    ...doc().hexes,
    '3,1': { terrain: 'building', icon: 'ruin', label: 'Ruína', secret: { icon: 'trap', label: 'Fosso oculto' }, note: 'cuidado' },
    '4,1': { secret: { label: 'só segredo' } },
  },
})

test('PRESETS.players: nada secreto nem nota chega ao draw; público mantido', () => {
  const d = filterDoc(gmDoc(), PRESETS.players)
  const s = JSON.stringify(d.hexes)
  expect(s).not.toMatch(/secret|note|trap|Fosso|só segredo|cuidado|"nota"|"n"/)
  for (const h of Object.values(d.hexes)) { expect(h.secret).toBeUndefined(); expect(h.note).toBeUndefined() }
  expect(d.hexes['3,1']).toEqual({ terrain: 'building', icon: 'ruin', label: 'Ruína' })
  expect(d.hexes['0,0']).toEqual({ terrain: 'forest', icon: 'castle', label: 'X' })
  expect('4,1' in d.hexes).toBe(false) // hex só com segredo some
  expect(d.bg?.key).toBe('k')
  expect(d.lines).toHaveLength(2)
})

test('filterDoc por camada', () => {
  const g = gmDoc()
  expect(filterDoc(g, { ...ALL, rivers: false }).lines).toEqual([{ a: '2,0', b: '3,0', kind: 'road' }])
  expect(filterDoc(g, { ...ALL, roads: false }).lines).toEqual([{ a: '0,0', b: '1,0', kind: 'river' }])
  const t = filterDoc(g, { ...ALL, terrain: false })
  expect(t.hexes['3,1']).toEqual({ icon: 'ruin', label: 'Ruína', secret: { icon: 'trap', label: 'Fosso oculto' } })
  expect('1,0' in t.hexes).toBe(false)
  const b = filterDoc(g, { ...ALL, bg: false })
  expect(b.bg).toBeUndefined()
  expect('bg' in b).toBe(false)
  expect(filterDoc(g, { ...ALL, icons: false }).hexes['3,1']).toEqual({ terrain: 'building', label: 'Ruína', secret: { label: 'Fosso oculto' } })
  expect(filterDoc(g, { ...ALL, labels: false }).hexes['3,1']).toEqual({ terrain: 'building', icon: 'ruin', secret: { icon: 'trap' } })
  expect(filterDoc(g, { ...ALL, labels: false }).hexes['4,1']).toBeUndefined()
})

test('PRESETS.gm mantém o segredo e remove a nota', () => {
  const d = filterDoc(gmDoc(), PRESETS.gm)
  expect(d.hexes['3,1']).toEqual({ terrain: 'building', icon: 'ruin', label: 'Ruína', secret: { icon: 'trap', label: 'Fosso oculto' } })
  expect(JSON.stringify(d.hexes)).not.toMatch(/note|cuidado/)
})

test('presets são independentes (mutar a cópia não altera o preset)', () => {
  const p = { ...PRESETS.players }
  p.secrets = true
  expect(PRESETS.players.secrets).toBe(false)
  expect(PRESETS.gm.secrets).toBe(true)
})

test('setSecret faz merge sobre o doc recebido', () => {
  const a = setSecret('5,5', { icon: 'trap' })(emptyDoc())
  const b = setSecret('5,5', { label: 'L' })(a)
  expect(b.hexes['5,5']).toEqual({ secret: { icon: 'trap', label: 'L' } })
  expect(setSecret('5,5', { icon: '' })(b).hexes['5,5']).toEqual({ secret: { label: 'L' } })
})

test('setSecret(null) preserva o público e a nota; hex vazio some', () => {
  const g = gmDoc()
  expect(setSecret('3,1', null)(g).hexes['3,1']).toEqual({ terrain: 'building', icon: 'ruin', label: 'Ruína', note: 'cuidado' })
  expect('4,1' in setSecret('4,1', null)(g).hexes).toBe(false)
  expect('4,1' in setSecret('4,1', { label: '' })(g).hexes).toBe(false)
  expect(setSecret('9,9', null)(g).hexes).toEqual(g.hexes)
})

test('setNote grava e remove (vazio/só espaços); hex vazio some', () => {
  const a = setNote('5,5', 'linha 1\nlinha 2')(emptyDoc())
  expect(a.hexes['5,5']).toEqual({ note: 'linha 1\nlinha 2' })
  expect('5,5' in setNote('5,5', '  ')(a).hexes).toBe(false)
  expect(setNote('0,0', '')(doc()).hexes['0,0']).toEqual({ terrain: 'forest', icon: 'castle', label: 'X' })
})

test('eraseHex em hex só com segredo/nota não muda o hex', () => {
  const g = gmDoc()
  expect(eraseHex('4,1')(g).hexes['4,1']).toEqual({ secret: { label: 'só segredo' } })
  expect(eraseHex('3,1')(g).hexes['3,1']).toEqual({ secret: { icon: 'trap', label: 'Fosso oculto' }, note: 'cuidado' })
})

test('notesMarkdown: ordem linha/coluna, segredo, omite hexes sem nota/segredo/rótulo', () => {
  const d = { ...gmDoc(), hexes: { ...gmDoc().hexes, '7,7': {}, '0,1': { terrain: 'forest', icon: 'castle' } } }
  expect(notesMarkdown(d)).toBe(`# Notas do mestre

## 0,0 — X

n

## 2,0
Segredo: Armadilha

nota

## 3,1 — Ruína
Segredo: Armadilha Fosso oculto

cuidado

## 4,1
Segredo: só segredo
`)
  expect(notesMarkdown(emptyDoc())).toBe('# Notas do mestre\n')
})

test('validTool troca id inexistente pelo primeiro do catálogo', () => {
  const d = doc()
  expect(validTool({ kind: 'terrain', id: 'x' }, d)).toEqual({ kind: 'terrain', id: Object.keys(d.terrains)[0] })
  expect(validTool({ kind: 'icon', id: 'x' }, d)).toEqual({ kind: 'icon', id: Object.keys(d.icons)[0] })
  const ok = { kind: 'terrain', id: 'forest' } as const
  expect(validTool(ok, d)).toBe(ok)
  expect(validTool({ kind: 'erase' }, d)).toEqual({ kind: 'erase' })
})

const rd = (): MapDoc => ({
  ...emptyDoc(),
  terrains: { rua: { name: 'Rua', color: '#000', cost: 2 }, esc: { name: 'Escombros', color: '#111', cost: 2 } },
  hexes: { '0,0': { terrain: 'rua' }, '1,0': { terrain: 'esc' }, '3,0': { terrain: 'removido' } },
})

test('pathCost soma só os hexes entrados', () => {
  const d = rd()
  // '2,0' sem hex, '3,0' com terreno inexistente: custam 1 cada
  expect(pathCost(d, ['0,0', '1,0', '2,0', '3,0'])).toBe(4) // 2 + 1 + 1
  expect(pathCost(d, ['0,0', '1,0'])).toBe(2)
  expect(pathCost(d, ['0,0'])).toBe(0)
  expect(pathCost(d, [])).toBe(0)
  const esc = { ...d, hexes: Object.fromEntries([0, 1, 2, 3, 4].map((c) => [`${c},0`, { terrain: 'esc' }])) }
  expect(pathCost(esc, Object.keys(esc.hexes))).toBe(8)
  expect(pathCost(setTerrain('esc', null)(esc), Object.keys(esc.hexes))).toBe(4) // terreno removido -> 1 por hex
})

test('rulerText: escala padrão e personalizada', () => {
  const esc = { ...rd(), hexes: Object.fromEntries([0, 1, 2, 3, 4].map((c) => [`${c},0`, { terrain: 'esc' }])) }
  const p = Object.keys(esc.hexes)
  expect(rulerText(esc, p)).toBe('4 hexes · 8 horas')
  expect(rulerText({ ...esc, scale: { value: 0.5, unit: 'km' } }, p)).toBe('4 hexes · 4 km')
  expect(rulerText({ ...esc, scale: { value: 1, unit: 'hora' } }, ['0,0', '1,0'])).toBe('1 hexes · 2 horas')
  expect(rulerText(esc, ['0,0'])).toBe('0 hexes · 0 horas')
})
