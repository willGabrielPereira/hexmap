# Hexmap

Editor de mapas para RPG de hexcrawl, inspirado no Hexographer. Roda 100% no navegador, sem backend.

## Funcionalidades

- Grade hexagonal (5 a 80 colunas/linhas), com pan e zoom.
- Pintura de terrenos (arrastando) e borracha.
- Ícones de pontos de interesse (castelo, vila, caverna, tesouro…) e rótulos de texto por hex.
- Rios e estradas entre hexes vizinhos.
- Desfazer/refazer.
- Salvamento automático no navegador (`localStorage`), salvar/abrir arquivo `.json` e exportar PNG.

## Como executar

Requer [Node.js](https://nodejs.org) 20 ou superior.

```bash
npm install
npm run dev      # servidor de desenvolvimento (http://localhost:5173)
```

Outros comandos:

```bash
npm run build    # build de produção em dist/
npm run preview  # serve o build localmente
npm run lint     # oxlint
npx vitest run   # testes
```

O build gera arquivos estáticos em `dist/`, que podem ser hospedados em qualquer servidor estático.

## Como usar

| Ação | Como |
| --- | --- |
| Pintar terreno / ícone | Escolha na barra lateral e clique ou arraste sobre o mapa |
| Rótulo | Ferramenta Rótulo, clique no hex e digite (Enter salva, Esc cancela) |
| Rio / estrada | Clique em hexes vizinhos em sequência (Esc cancela) |
| Mover o mapa | Espaço + arrastar, ou botão direito/do meio |
| Zoom | Roda do mouse ou botões na barra de zoom |

Atalhos: `B` terreno, `I` ícone, `L` rótulo, `R` rio, `D` estrada, `E` borracha, `Ctrl+Z` desfazer, `Ctrl+Shift+Z` / `Ctrl+Y` refazer.

## Salvando seu trabalho

O mapa é salvo automaticamente no navegador, mas esse salvamento é local àquele navegador e pode ser perdido ao limpar os dados do site. Para guardar de forma segura ou levar para outro computador, use **Salvar** (gera `hexmap.json`) e **Abrir** para carregá-lo depois.

## Estrutura

```
src/
  hex.ts        geometria dos hexágonos (pixel ↔ hex, vizinhos)
  store.ts      estado do mapa, undo/redo
  render.ts     desenho no canvas (também usado na exportação PNG)
  icons.ts      ícones Phosphor usados nos hexes
  palette.ts    terrenos e ferramentas
  persist.ts    localStorage, arquivo JSON, PNG
  MapCanvas.tsx interação com o mapa
  App.tsx       barra lateral e modais
```

## Stack

Vite, React, TypeScript, Canvas 2D e [Phosphor Icons](https://phosphoricons.com).
