import type { MapDoc, Terrain, Tool } from './types'

export const DEFAULT_TERRAINS: Record<string, Terrain> = {
  plains: { name: 'Planície', color: '#a8cf7a', cost: 1 },
  forest: { name: 'Floresta', color: '#4a8f5a', cost: 1.5 },
  hills: { name: 'Colinas', color: '#b5a96a', cost: 1.5 },
  mountain: { name: 'Montanha', color: '#9a9aa6', cost: 2 },
  desert: { name: 'Deserto', color: '#e8cf8e', cost: 1 },
  swamp: { name: 'Pântano', color: '#6f9484', cost: 2 },
  water: { name: 'Água', color: '#5a9ad8', cost: 3 },
  snow: { name: 'Neve', color: '#e9f0f7', cost: 1.5 },
  street: { name: 'Rua', color: '#c9c2b4', cost: 0.5 },
  rubble: { name: 'Escombros', color: '#8c7f73', cost: 2 },
  building: { name: 'Edifício', color: '#a0786a', cost: 1.5 },
  plaza: { name: 'Praça', color: '#d8cfa8', cost: 1 },
  sewer: { name: 'Esgoto', color: '#5f6b4e', cost: 2 },
  wall: { name: 'Muralha', color: '#6e6a72', cost: 3 },
}

// ferramenta que aponta para id excluído do catálogo -> primeiro item do catálogo
export function validTool(t: Tool, d: MapDoc): Tool {
  if (t.kind !== 'terrain' && t.kind !== 'icon') return t
  const cat = t.kind === 'terrain' ? d.terrains : d.icons
  return Object.hasOwn(cat, t.id) ? t : { kind: t.kind, id: Object.keys(cat)[0] }
}

export function describeTool(t: Tool, d: MapDoc): { name: string; hint: string } {
  switch (t.kind) {
    case 'terrain': return { name: `Terreno: ${d.terrains[t.id]?.name ?? t.id}`, hint: 'Clique ou arraste para pintar' }
    case 'icon': return { name: `Ícone: ${d.icons[t.id]?.name ?? t.id}`, hint: 'Clique ou arraste para colocar' }
    case 'label': return { name: 'Rótulo', hint: 'Clique num hex para escrever · vazio apaga' }
    case 'erase': return { name: 'Borracha', hint: 'Clique ou arraste para limpar hexes' }
    case 'river': return { name: 'Rio', hint: 'Clique num hex e depois em hexes vizinhos' }
    case 'road': return { name: 'Estrada', hint: 'Clique num hex e depois em hexes vizinhos' }
    case 'note': return { name: 'Nota', hint: 'Clique num hex para escrever a nota do mestre' }
    case 'ruler': return { name: 'Régua', hint: 'Clique nos hexes para traçar o caminho · Esc limpa' }
    case 'calibrate': return { name: 'Medir escala', hint: 'Medir 1/2: clique no lado esquerdo de um hex · dê zoom na visão (roda) para clicar com precisão · Esc cancela' }
    case 'adjust': return { name: 'Ajustar fundo', hint: 'Arraste para mover o fundo · roda do mouse muda o tamanho · Esc conclui' }
  }
}
