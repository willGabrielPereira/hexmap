// a, b: chaves "col,row" de hexes vizinhos
export type Edge = { a: string; b: string; kind: 'river' | 'road' }
export type MapDocV1 = { v: 1; cols: number; rows: number; hexes: Record<string, { terrain?: string; icon?: string; label?: string }>; lines: Edge[] }
export type Item = { icon?: string; label?: string }
export type Hex = Item & { terrain?: string; secret?: Item; note?: string }
export type Terrain = { name: string; color: string; cost: number }
export type IconDef = { name: string; glyph: string; color?: string }
// mundo = (x,y) + px_imagem*scale; w,h = tamanho natural; src '' = imagem ainda não carregada do IDB
export type Bg = { key: string; src: string; w: number; h: number; x: number; y: number; scale: number; opacity: number }
export type MapDoc = {
  v: 2
  cols: number
  rows: number
  hexes: Record<string, Hex>
  lines: Edge[]
  terrains: Record<string, Terrain>
  icons: Record<string, IconDef>
  bg?: Bg
  style?: 'solid' | 'tint' | 'outline'
  hexOpacity?: number // opacidade da cor do terreno (0–1); sem valor: 1 em 'solid', .45 em 'tint'
  scale?: { value: number; unit: string }
}
export type View = { x: number; y: number; zoom: number }
export type Tool =
  | { kind: 'terrain' | 'icon'; id: string }
  | { kind: 'label' | 'river' | 'road' | 'erase' | 'calibrate' | 'adjust' | 'note' | 'ruler' }
// camadas do export (grid não vive no doc: vai como DrawOpts.grid)
export type Layers = Record<'bg' | 'terrain' | 'grid' | 'rivers' | 'roads' | 'icons' | 'labels' | 'secrets', boolean>
