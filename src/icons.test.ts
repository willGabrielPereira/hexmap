import { expect, test } from 'vitest'
import { FEATURES, normalizeIcon } from './icons'

test('ids antigos (emoji) viram ids novos; ids novos e desconhecidos passam', () => {
  expect(normalizeIcon('🏘️')).toBe('village')
  expect(normalizeIcon('⚔️')).toBe('battle')
  expect(normalizeIcon('🏰')).toBe('castle')
  expect(normalizeIcon('castle')).toBe('castle')
  for (const id of ['🏰', '🏘️', '🏛️', '⛺', '🗼', '💀', '🐉', '⚔️', '🕳️', '⛰️', '🌋', '⚓', '💎', '❓'])
    expect(normalizeIcon(id) in FEATURES).toBe(true)
})
