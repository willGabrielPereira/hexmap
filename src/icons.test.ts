import { expect, test } from 'vitest'
import { DEFAULT_ICONS, GLYPHS, LEGACY, normalizeIcon } from './icons'

test('ids antigos (emoji) viram ids novos; ids novos e desconhecidos passam', () => {
  expect(normalizeIcon('🏘️')).toBe('village')
  expect(normalizeIcon('⚔️')).toBe('battle')
  expect(normalizeIcon('🏰')).toBe('castle')
  expect(normalizeIcon('castle')).toBe('castle')
  for (const id of ['🏰', '🏘️', '🏛️', '⛺', '🗼', '💀', '🐉', '⚔️', '🕳️', '⛰️', '🌋', '⚓', '💎', '❓'])
    expect(normalizeIcon(id) in DEFAULT_ICONS).toBe(true)
})

test('todo glifo default existe em GLYPHS; todo LEGACY aponta para um default', () => {
  for (const d of Object.values(DEFAULT_ICONS)) expect(d.glyph in GLYPHS).toBe(true)
  for (const id of Object.values(LEGACY)) expect(id in DEFAULT_ICONS).toBe(true)
  expect('question' in GLYPHS).toBe(true)
  for (const svg of Object.values(GLYPHS)) expect(svg).toMatch(/ d="/)
})
