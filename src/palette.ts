import type { Tool } from './types'
import { FEATURES } from './icons'

export const TERRAINS: Record<string, { name: string; color: string }> = {
  plains: { name: 'Planície', color: '#a8cf7a' },
  forest: { name: 'Floresta', color: '#4a8f5a' },
  hills: { name: 'Colinas', color: '#b5a96a' },
  mountain: { name: 'Montanha', color: '#9a9aa6' },
  desert: { name: 'Deserto', color: '#e8cf8e' },
  swamp: { name: 'Pântano', color: '#6f9484' },
  water: { name: 'Água', color: '#5a9ad8' },
  snow: { name: 'Neve', color: '#e9f0f7' },
}

export function describeTool(t: Tool): { name: string; hint: string } {
  switch (t.kind) {
    case 'terrain': return { name: `Terreno: ${TERRAINS[t.id]?.name ?? t.id}`, hint: 'Clique ou arraste para pintar' }
    case 'icon': return { name: `Ícone: ${FEATURES[t.id as keyof typeof FEATURES]?.name ?? t.id}`, hint: 'Clique ou arraste para colocar' }
    case 'label': return { name: 'Rótulo', hint: 'Clique num hex para escrever · vazio apaga' }
    case 'erase': return { name: 'Borracha', hint: 'Clique ou arraste para limpar hexes' }
    case 'river': return { name: 'Rio', hint: 'Clique num hex e depois em hexes vizinhos' }
    case 'road': return { name: 'Estrada', hint: 'Clique num hex e depois em hexes vizinhos' }
  }
}
