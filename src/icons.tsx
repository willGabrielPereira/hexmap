// oxlint-disable react/only-export-components -- dados dos glifos e <Glyph> no mesmo módulo (fonte única); só custa o fast refresh deste arquivo
import anchor from '@phosphor-icons/core/assets/fill/anchor-fill.svg?raw'
import arrowCircleDown from '@phosphor-icons/core/assets/fill/arrow-circle-down-fill.svg?raw'
import bank from '@phosphor-icons/core/assets/fill/bank-fill.svg?raw'
import campfire from '@phosphor-icons/core/assets/fill/campfire-fill.svg?raw'
import castleTurret from '@phosphor-icons/core/assets/fill/castle-turret-fill.svg?raw'
import diamond from '@phosphor-icons/core/assets/fill/diamond-fill.svg?raw'
import fire from '@phosphor-icons/core/assets/fill/fire-fill.svg?raw'
import flag from '@phosphor-icons/core/assets/fill/flag-fill.svg?raw'
import houseLine from '@phosphor-icons/core/assets/fill/house-line-fill.svg?raw'
import lighthouse from '@phosphor-icons/core/assets/fill/lighthouse-fill.svg?raw'
import mountains from '@phosphor-icons/core/assets/fill/mountains-fill.svg?raw'
import pentagram from '@phosphor-icons/core/assets/fill/pentagram-fill.svg?raw'
import question from '@phosphor-icons/core/assets/fill/question-fill.svg?raw'
import skull from '@phosphor-icons/core/assets/fill/skull-fill.svg?raw'
import sword from '@phosphor-icons/core/assets/fill/sword-fill.svg?raw'
import tent from '@phosphor-icons/core/assets/fill/tent-fill.svg?raw'
import tree from '@phosphor-icons/core/assets/fill/tree-fill.svg?raw'
import treeEvergreen from '@phosphor-icons/core/assets/fill/tree-evergreen-fill.svg?raw'
import buildings from '@phosphor-icons/core/assets/fill/buildings-fill.svg?raw'
import building from '@phosphor-icons/core/assets/fill/building-fill.svg?raw'
import wall from '@phosphor-icons/core/assets/fill/wall-fill.svg?raw'
import barricade from '@phosphor-icons/core/assets/fill/barricade-fill.svg?raw'
import warning from '@phosphor-icons/core/assets/fill/warning-fill.svg?raw'
import door from '@phosphor-icons/core/assets/fill/door-fill.svg?raw'
import doorOpen from '@phosphor-icons/core/assets/fill/door-open-fill.svg?raw'
import stairs from '@phosphor-icons/core/assets/fill/stairs-fill.svg?raw'
import ladder from '@phosphor-icons/core/assets/fill/ladder-fill.svg?raw'
import key from '@phosphor-icons/core/assets/fill/key-fill.svg?raw'
import lock from '@phosphor-icons/core/assets/fill/lock-fill.svg?raw'
import coins from '@phosphor-icons/core/assets/fill/coins-fill.svg?raw'
import scroll from '@phosphor-icons/core/assets/fill/scroll-fill.svg?raw'
import eye from '@phosphor-icons/core/assets/fill/eye-fill.svg?raw'
import ghost from '@phosphor-icons/core/assets/fill/ghost-fill.svg?raw'
import crown from '@phosphor-icons/core/assets/fill/crown-fill.svg?raw'
import shield from '@phosphor-icons/core/assets/fill/shield-fill.svg?raw'
import bridge from '@phosphor-icons/core/assets/fill/bridge-fill.svg?raw'
import church from '@phosphor-icons/core/assets/fill/church-fill.svg?raw'
import factory from '@phosphor-icons/core/assets/fill/factory-fill.svg?raw'
import trash from '@phosphor-icons/core/assets/fill/trash-fill.svg?raw'
import drop from '@phosphor-icons/core/assets/fill/drop-fill.svg?raw'
import pipe from '@phosphor-icons/core/assets/fill/pipe-fill.svg?raw'
import warehouse from '@phosphor-icons/core/assets/fill/warehouse-fill.svg?raw'
import storefront from '@phosphor-icons/core/assets/fill/storefront-fill.svg?raw'
import bone from '@phosphor-icons/core/assets/fill/bone-fill.svg?raw'
import biohazard from '@phosphor-icons/core/assets/fill/biohazard-fill.svg?raw'
import flask from '@phosphor-icons/core/assets/fill/flask-fill.svg?raw'
import bookOpen from '@phosphor-icons/core/assets/fill/book-open-fill.svg?raw'
import users from '@phosphor-icons/core/assets/fill/users-fill.svg?raw'
import person from '@phosphor-icons/core/assets/fill/person-fill.svg?raw'
import cross from '@phosphor-icons/core/assets/fill/cross-fill.svg?raw'
import lightning from '@phosphor-icons/core/assets/fill/lightning-fill.svg?raw'
import hourglass from '@phosphor-icons/core/assets/fill/hourglass-fill.svg?raw'
import mapPin from '@phosphor-icons/core/assets/fill/map-pin-fill.svg?raw'
import type { IconDef } from './types'

// Glifos Phosphor (fill, 256x256): o mesmo SVG serve à UI (<Glyph>) e ao canvas (Path2D).
export const GLYPHS: Record<string, string> = {
  anchor, 'arrow-circle-down': arrowCircleDown, bank, campfire, 'castle-turret': castleTurret, diamond, fire, flag,
  'house-line': houseLine, lighthouse, mountains, pentagram, question, skull, sword, tent, tree, 'tree-evergreen': treeEvergreen,
  buildings, building, wall, barricade, warning, door, 'door-open': doorOpen, stairs, ladder, key, lock, coins, scroll, eye,
  ghost, crown, shield, bridge, church, factory, trash, drop, pipe, warehouse, storefront, bone, biohazard, flask,
  'book-open': bookOpen, users, person, cross, lightning, hourglass, 'map-pin': mapPin,
}

export const DEFAULT_ICONS: Record<string, IconDef> = {
  castle: { name: 'Castelo', glyph: 'castle-turret' },
  village: { name: 'Vila', glyph: 'house-line' },
  temple: { name: 'Templo', glyph: 'bank' },
  camp: { name: 'Acampamento', glyph: 'tent' },
  tower: { name: 'Torre', glyph: 'lighthouse' },
  skull: { name: 'Perigo', glyph: 'skull' },
  dragon: { name: 'Covil', glyph: 'pentagram' },
  battle: { name: 'Batalha', glyph: 'sword' },
  cave: { name: 'Caverna', glyph: 'arrow-circle-down' },
  peak: { name: 'Pico', glyph: 'mountains' },
  volcano: { name: 'Vulcão', glyph: 'fire' },
  port: { name: 'Porto', glyph: 'anchor' },
  treasure: { name: 'Tesouro', glyph: 'diamond' },
  unknown: { name: 'Mistério', glyph: 'question' },
  tree: { name: 'Árvore', glyph: 'tree' },
  pine: { name: 'Pinheiro', glyph: 'tree-evergreen' },
  fire: { name: 'Fogueira', glyph: 'campfire' },
  flag: { name: 'Marco', glyph: 'flag' },
  ruin: { name: 'Ruína', glyph: 'buildings' },
  door: { name: 'Porta', glyph: 'door' },
  stairs: { name: 'Escada', glyph: 'stairs' },
  trap: { name: 'Armadilha', glyph: 'warning' },
  loot: { name: 'Saque', glyph: 'coins' },
  key: { name: 'Chave', glyph: 'key' },
  sewer: { name: 'Esgoto', glyph: 'pipe' },
  wall: { name: 'Muralha', glyph: 'wall' },
  barricade: { name: 'Barricada', glyph: 'barricade' },
}

// Mapas antigos guardavam o emoji como id.
export const LEGACY: Record<string, string> = {
  '🏰': 'castle', '🏘': 'village', '🏛': 'temple', '⛺': 'camp', '🗼': 'tower', '💀': 'skull', '🐉': 'dragon',
  '⚔': 'battle', '🕳': 'cave', '⛰': 'peak', '🌋': 'volcano', '⚓': 'port', '💎': 'treasure', '❓': 'unknown',
}
export const normalizeIcon = (id: string): string => LEGACY[id.replace(/️/g, '')] ?? id

const ds = new Map<string, string>()
const glyphD = (glyph: string) => {
  let d = ds.get(glyph)
  if (d === undefined) {
    d = [...(GLYPHS[glyph] ?? question).matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(' ')
    ds.set(glyph, d)
  }
  return d
}

const paths = new Map<string, Path2D>()
export function glyphPath(glyph: string): Path2D {
  let p = paths.get(glyph)
  if (!p) {
    p = new Path2D(glyphD(glyph))
    paths.set(glyph, p)
  }
  return p
}

export function Glyph({ glyph, size = 20 }: { glyph: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d={glyphD(glyph)} />
    </svg>
  )
}
