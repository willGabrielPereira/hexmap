import { expect, test } from 'vitest'
import { center, isNeighbor, key, neighbors, pixelToHex } from './hex'

test('pixel -> hex round-trip e vizinhança', () => {
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 6; c++) {
      const [x, y] = center(c, r)
      expect(pixelToHex(x, y)).toEqual([c, r])
      expect(pixelToHex(x + 5, y - 5)).toEqual([c, r])
      for (const [nc, nr] of neighbors(c, r)) expect(isNeighbor(key(nc, nr), key(c, r))).toBe(true)
    }
})
