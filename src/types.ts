export type Hex = { terrain?: string; icon?: string; label?: string }
// a, b: chaves "col,row" de hexes vizinhos
export type Edge = { a: string; b: string; kind: 'river' | 'road' }
export type MapDoc = {
  v: 1
  cols: number
  rows: number
  hexes: Record<string, Hex>
  lines: Edge[]
}
export type View = { x: number; y: number; zoom: number }
export type Tool =
  | { kind: 'terrain' | 'icon'; id: string }
  | { kind: 'label' | 'river' | 'road' | 'erase' }
