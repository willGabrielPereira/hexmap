import {
  Anchor, ArrowCircleDown, Bank, Campfire, CastleTurret, Diamond, Fire, Flag, HouseLine, Lighthouse,
  Mountains, Pentagram, Question, Skull, Sword, Tent, Tree, TreeEvergreen, type Icon,
} from '@phosphor-icons/react'
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

// Fonte única: o mesmo ícone Phosphor serve à UI (componente React) e ao canvas (Path2D do SVG, 256x256).
export const FEATURES = {
  castle: { name: 'Castelo', C: CastleTurret, svg: castleTurret },
  village: { name: 'Vila', C: HouseLine, svg: houseLine },
  temple: { name: 'Templo', C: Bank, svg: bank },
  camp: { name: 'Acampamento', C: Tent, svg: tent },
  tower: { name: 'Torre', C: Lighthouse, svg: lighthouse },
  skull: { name: 'Perigo', C: Skull, svg: skull },
  dragon: { name: 'Covil', C: Pentagram, svg: pentagram },
  battle: { name: 'Batalha', C: Sword, svg: sword },
  cave: { name: 'Caverna', C: ArrowCircleDown, svg: arrowCircleDown },
  peak: { name: 'Pico', C: Mountains, svg: mountains },
  volcano: { name: 'Vulcão', C: Fire, svg: fire },
  port: { name: 'Porto', C: Anchor, svg: anchor },
  treasure: { name: 'Tesouro', C: Diamond, svg: diamond },
  unknown: { name: 'Mistério', C: Question, svg: question },
  tree: { name: 'Árvore', C: Tree, svg: tree },
  pine: { name: 'Pinheiro', C: TreeEvergreen, svg: treeEvergreen },
  fire: { name: 'Fogueira', C: Campfire, svg: campfire },
  flag: { name: 'Marco', C: Flag, svg: flag },
} satisfies Record<string, { name: string; C: Icon; svg: string }>

export type FeatureId = keyof typeof FEATURES

// Mapas antigos guardavam o emoji como id.
const LEGACY: Record<string, FeatureId> = {
  '🏰': 'castle', '🏘': 'village', '🏛': 'temple', '⛺': 'camp', '🗼': 'tower', '💀': 'skull', '🐉': 'dragon',
  '⚔': 'battle', '🕳': 'cave', '⛰': 'peak', '🌋': 'volcano', '⚓': 'port', '💎': 'treasure', '❓': 'unknown',
}
export const normalizeIcon = (id: string): string => LEGACY[id.replace(/️/g, '')] ?? id

const paths = new Map<string, Path2D>()
export function featurePath(id: string): Path2D | undefined {
  const f = FEATURES[id as FeatureId]
  if (!f) return undefined
  let p = paths.get(id)
  if (!p) {
    p = new Path2D([...f.svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(' '))
    paths.set(id, p)
  }
  return p
}
