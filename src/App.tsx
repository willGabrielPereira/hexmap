import { useEffect, useReducer, useRef, useState, type Dispatch } from 'react'
import {
  ArrowClockwise, ArrowCounterClockwise, ArrowsOutCardinal,
  CheckCircle, CircleNotch, Crosshair, CursorText, Eraser, EyeSlash, FilePlus, FileText, FolderOpen,
  FloppyDisk, Hexagon, Image, MapTrifold, NotePencil, PencilSimple, Plus, RoadHorizon, Ruler, Trash, UploadSimple, Warning, Waves, X,
} from '@phosphor-icons/react'
import { MapCanvas } from './MapCanvas'
import { GLYPHS, Glyph } from './icons'
import { validTool } from './palette'
import { exportPng, loadFile, saveFile, saveLocal, saveNotes, setPersistWarn } from './persist'
import { MAP_ORIGIN, bgCovers, fitBgToMap, fitMapToBg } from './render'
import { DEFAULT_SCALE, PRESETS, emptyDoc, filterDoc, init, reducer, resize, setIcon, setTerrain, shouldSave, uid, type Action } from './store'
import type { Bg, Hex, Layers, MapDoc, Tool } from './types'

const LAYER_UI: [keyof Layers, string][] = [
  ['bg', 'Imagem de fundo'], ['terrain', 'Cor do terreno'], ['grid', 'Grade'], ['rivers', 'Rios'],
  ['roads', 'Estradas'], ['icons', 'Ícones'], ['labels', 'Rótulos'], ['secrets', 'Segredos'],
]
const sameLayers = (a: Layers, b: Layers) => LAYER_UI.every(([f]) => a[f] === b[f])

const TABS = [['draw', 'Desenhar', PencilSimple], ['map', 'Mapa', MapTrifold], ['file', 'Arquivo', FolderOpen]] as const
type TabId = (typeof TABS)[number][0]
const TAB_KEY = 'hexmap:tab' // última aba; falha silenciosa se o storage estiver bloqueado
const readTab = (): TabId => { try { const t = localStorage.getItem(TAB_KEY); return TABS.find(([id]) => id === t)?.[0] ?? 'draw' } catch { return 'draw' } }

const same = (a: Tool, b: Tool) => a.kind === b.kind && (!('id' in a) || ('id' in b && a.id === b.id))
const clamp = (n: number) => Math.min(80, Math.max(5, Math.round(n) || 5))

// lado maior > 4096 px é reduzido; JPEG continua JPEG .85, o resto vira PNG (preserva alfa)
async function readImage(f: File): Promise<Pick<Bg, 'src' | 'w' | 'h'>> {
  const src = await new Promise<string>((ok, no) => {
    const r = new FileReader()
    r.onload = () => ok(r.result as string)
    r.onerror = () => no(r.error)
    r.readAsDataURL(f)
  })
  if (!src.startsWith('data:image/')) throw new Error('O arquivo não é uma imagem')
  const img = new window.Image() // `Image` aqui é o ícone do phosphor
  img.src = src
  await img.decode()
  const w = img.naturalWidth, h = img.naturalHeight, s = 4096 / Math.max(w, h)
  if (s >= 1) return { src, w, h }
  const cv = document.createElement('canvas')
  cv.width = Math.round(w * s)
  cv.height = Math.round(h * s)
  cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height)
  return { src: cv.toDataURL(f.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.85), w: cv.width, h: cv.height }
}

export default function App({ initial, bad, missing }: { initial: MapDoc; bad?: string; missing?: true }) {
  const [{ doc, past, future }, dispatch] = useReducer(reducer, initial, init)
  const firstTerrain: Tool = { kind: 'terrain', id: Object.keys(initial.terrains)[0] }
  const [rawTool, setTool] = useState<Tool>(firstTerrain)
  const tool = validTool(rawTool, doc) // item excluído do catálogo -> primeiro item
  const [savedDoc, setSavedDoc] = useState(doc)
  const saved = savedDoc === doc
  const [tab, setTab] = useState<TabId>(readTab) // painéis ficam montados (hidden): refs e formulários intactos
  const chooseTab = (id: TabId, focus = false) => {
    setTab(id)
    try { localStorage.setItem(TAB_KEY, id) } catch { /* ignora */ }
    if (focus) document.getElementById(`tab-${id}`)?.focus()
  }
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex(([id]) => id === tab), n = TABS.length
    const j = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key]
    if (j === undefined) return
    e.preventDefault()
    chooseTab(TABS[j][0], true)
  }
  const [confirmNew, setConfirmNew] = useState(false)
  const [palette, setPalette] = useState(false)
  const [confirmNoBg, setConfirmNoBg] = useState(false)
  const [error, setError] = useState(bad !== undefined ? 'O mapa salvo não pôde ser lido; cópia guardada em hexmap:doc:bad'
    : missing ? 'Imagem de fundo perdida; carregue de novo' : undefined)
  const last = useRef<{ terrain: Tool; icon: Tool }>({ terrain: firstTerrain, icon: { kind: 'icon', id: Object.keys(initial.icons)[0] } })
  const touched = useRef(false)
  const fileIn = useRef<HTMLInputElement>(null)
  const imgIn = useRef<HTMLInputElement>(null)
  const prevTool = useRef<Tool>(firstTerrain) // volta para ela ao fim do ajuste/calibragem
  const [measureText, setMeasureText] = useState('1') // texto livre (aceita "0." ao digitar); inválido -> scaleFromPoints ignora
  const measureHexes = Number(measureText)
  const bgSnapped = useRef(false) // range de opacidade: 1 snap por gesto
  const hexSnapped = useRef(false)

  useEffect(() => setPersistWarn(setError), [])

  const save = () => (doc.bg && !doc.bg.src ? setConfirmNoBg(true) : saveFile(doc))
  const [secret, setSecretMode] = useState(false)
  const [exp, setExp] = useState<Layers>() // diálogo de export; sempre reabre em PRESETS.players
  const exportImg = (L: Layers) => {
    setExp(undefined)
    if (L.bg && doc.bg && !doc.bg.src) setError('Fundo não carregado; exportado sem a imagem')
    // barreira dupla: filterDoc tira os dados e secrets:false impede o draw de desenhá-los
    exportPng(filterDoc(doc, L), { grid: L.grid, secrets: L.secrets }).catch((e) => setError('Falha ao exportar PNG: ' + e.message))
  }
  const setBg = (patch: Partial<Bg>, snap = true) => {
    if (snap) dispatch({ t: 'snap' })
    dispatch({ t: 'edit', fn: (d) => (d.bg ? { ...d, bg: { ...d.bg, ...patch } } : d) })
  }

  const enter = (t: Tool) => { // ferramentas temporárias lembram a anterior (sem sobrescrevê-la ao alternar entre elas)
    if (tool.kind !== 'adjust' && tool.kind !== 'calibrate') prevTool.current = tool
    pick(t)
  }
  const pick = (t: Tool) => {
    if (t.kind === 'terrain') last.current.terrain = t
    if (t.kind === 'icon') last.current.icon = t
    setTool(t)
  }

  useEffect(() => {
    last.current = { terrain: validTool(last.current.terrain, doc), icon: validTool(last.current.icon, doc) }
    touched.current = shouldSave(touched.current, doc, initial)
    if (!touched.current) return // o doc carregado só é gravado depois da 1ª edição
    const t = setTimeout(() => { saveLocal(doc); setSavedDoc(doc) }, 300) // autosave
    return () => clearTimeout(t)
  }, [doc, initial])

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(undefined), 5000)
    return () => clearTimeout(t)
  }, [error])

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return
      if (document.querySelector('dialog[open]')) return
      const k = e.key.toLowerCase()
      if (e.ctrlKey || e.metaKey) {
        if (k === 'z') { e.preventDefault(); dispatch({ t: e.shiftKey ? 'redo' : 'undo' }) }
        else if (k === 'y') { e.preventDefault(); dispatch({ t: 'redo' }) }
        return
      }
      if (e.altKey) return
      if (k === 's') { setSecretMode((v) => !v); return }
      const l = last.current
      const t: Tool | undefined = {
        b: l.terrain, i: l.icon, l: { kind: 'label' },
        r: { kind: 'river' }, d: { kind: 'road' }, e: { kind: 'erase' }, n: { kind: 'note' }, m: { kind: 'ruler' },
      }[k] as Tool | undefined
      if (t) pick(t)
    }
    window.addEventListener('keydown', kd)
    return () => window.removeEventListener('keydown', kd)
  }, [])

  const toolBtn = (t: Tool, content: React.ReactNode, cls = '', title?: string) => {
    const on = same(tool, t)
    return (
      <button key={'id' in t ? t.kind + t.id : t.kind} className={`${cls} ${on ? 'on' : ''}`} aria-pressed={on} title={title} aria-label={title} onClick={() => pick(t)}>
        {content}
      </button>
    )
  }
  const kbd = (k: string) => <kbd>{k}</kbd>

  const sizeField = (label: string, field: 'cols' | 'rows') => (
    <label className="field">
      <span>{label}</span>
      <input
        type="number" min={5} max={80} key={doc[field]} defaultValue={doc[field]}
        onBlur={(e) => {
          const n = clamp(e.target.valueAsNumber)
          e.target.value = String(n)
          if (n !== doc[field]) {
            dispatch({ t: 'snap' })
            dispatch({ t: 'edit', fn: resize(field === 'cols' ? n : doc.cols, field === 'rows' ? n : doc.rows) })
          }
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  )

  // ajuste fino do fundo; compara com o valor exibido (arredondado) para não gerar snap só por focar e sair
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4
  const bgField = (label: string, f: 'x' | 'y' | 'scale', bg: Bg) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="number" step={f === 'scale' ? 0.01 : 1} key={bg[f]} defaultValue={r4(bg[f])}
        onBlur={(e) => {
          const n = e.target.valueAsNumber
          if (Number.isFinite(n) && (f !== 'scale' || n > 0) && n !== r4(bg[f])) setBg({ [f]: n })
          else e.target.value = String(r4(bg[f]))
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  )

  const loadBg = async (f: File) => {
    try {
      const im = await readImage(f)
      dispatch({ t: 'snap' })
      dispatch({ t: 'edit', fn: (d) => ({ ...d, bg: { key: uid(), ...im, x: MAP_ORIGIN[0], y: MAP_ORIGIN[1], scale: 1, opacity: 0.6 } }) })
    } catch (e) { setError('Falha ao carregar a imagem: ' + (e as Error).message) }
  }

  const scale = doc.scale ?? DEFAULT_SCALE
  const setScale = (s: { value: number; unit: string }) => {
    dispatch({ t: 'snap' })
    dispatch({ t: 'edit', fn: (d) => ({ ...d, scale: s }) })
  }

  const newMap = () => { dispatch({ t: 'load', doc: emptyDoc() }); setConfirmNew(false) }
  const bg = doc.bg

  return (
    <div className="app">
      {confirmNew && (
        <dialog className="modal" ref={(d) => { if (d && !d.open) d.showModal() }}
          onClose={() => setConfirmNew(false)} onClick={(e) => e.target === e.currentTarget && setConfirmNew(false)}>
          <h3>Criar um novo mapa?</h3>
          <p>O mapa atual será apagado. Se você não salvou em arquivo, os dados serão perdidos — o salvamento automático do navegador também é substituído.</p>
          <div className="modal-actions">
            <button autoFocus onClick={() => setConfirmNew(false)}>Cancelar</button>
            <button onClick={() => { saveFile(doc); newMap() }}><FloppyDisk />Salvar arquivo e criar novo</button>
            <button className="danger" onClick={newMap}>Apagar sem salvar</button>
          </div>
        </dialog>
      )}
      {confirmNoBg && (
        <dialog className="modal" ref={(d) => { if (d && !d.open) d.showModal() }}
          onClose={() => setConfirmNoBg(false)} onClick={(e) => e.target === e.currentTarget && setConfirmNoBg(false)}>
          <h3>Salvar sem a imagem de fundo?</h3>
          <p>A imagem de fundo não carregou nesta sessão. Salvar sem a imagem de fundo?</p>
          <div className="modal-actions">
            <button autoFocus onClick={() => setConfirmNoBg(false)}>Cancelar</button>
            <button onClick={() => { saveFile({ ...doc, bg: undefined }); setConfirmNoBg(false) }}><FloppyDisk />Salvar sem fundo</button>
          </div>
        </dialog>
      )}
      {exp && (
        <dialog className="modal export" aria-labelledby="exp-title" ref={(d) => { if (d && !d.open) d.showModal() }}
          onClose={() => setExp(undefined)} onClick={(e) => e.target === e.currentTarget && setExp(undefined)}>
          <h3 id="exp-title">Exportar</h3>
          <div className="grid g2" role="group" aria-label="Predefinições">
            {([['Versão dos jogadores', PRESETS.players], ['Versão do mestre', PRESETS.gm]] as const).map(([name, p]) => {
              const on = sameLayers(exp, p)
              return <button key={name} className={on ? 'on' : ''} aria-pressed={on} onClick={() => setExp({ ...p })}>{name}</button>
            })}
          </div>
          <fieldset className="layers">
            <legend>Camadas</legend>
            {LAYER_UI.map(([f, name]) => (
              <label key={f}><input type="checkbox" checked={exp[f]} onChange={(e) => setExp({ ...exp, [f]: e.target.checked })} />{name}</label>
            ))}
          </fieldset>
          {exp.secrets && <p className="bg-warn" role="status"><Warning weight="fill" />Inclui segredos: não envie aos jogadores</p>}
          <div className="modal-actions">
            <button onClick={() => setExp(undefined)}>Cancelar</button>
            <button autoFocus onClick={() => exportImg(exp)}><Image />Exportar PNG</button>
          </div>
          <hr />
          <div className="modal-actions">
            <button className="gm-notes" title="Notas e segredos em texto; não envie aos jogadores" onClick={() => saveNotes(doc)}>
              <FileText />Notas do mestre (.md)
            </button>
          </div>
        </dialog>
      )}
      {palette && <Palette doc={doc} dispatch={dispatch} onClose={() => setPalette(false)} />}
      <aside>
        <header className="brand">
          <Hexagon weight="fill" size={22} />
          <span>Hexmap</span>
        </header>

          <div className="tabs" role="tablist" aria-label="Menu lateral" onKeyDown={onTabKey}>
            {TABS.map(([id, label, Ico]) => (
              <button key={id} role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} tabIndex={tab === id ? 0 : -1}
                className="tab" title={label} onClick={() => chooseTab(id)}>
                <Ico /><span>{label}</span>
              </button>
            ))}
          </div>

          <div className="side-scroll" role="tabpanel" id="panel-draw" aria-labelledby="tab-draw" hidden={tab !== 'draw'}>
          <section>
            <h4>Terreno {kbd('B')}</h4>
            <div className="grid g2">
              {Object.entries(doc.terrains).map(([id, t]) =>
                toolBtn({ kind: 'terrain', id }, <><i className="sw" style={{ background: t.color }} />{t.name}</>))}
            </div>
            <button className="pal-open" onClick={() => setPalette(true)}><PencilSimple />Editar paleta</button>
          </section>

          <section>
            <h4>Ícones {kbd('I')}</h4>
            <div className="grid g6">
              {Object.entries(doc.icons).map(([id, { name, glyph }]) =>
                toolBtn({ kind: 'icon', id }, <Glyph glyph={glyph} />, 'icon', name))}
            </div>
            <button className="pal-open" onClick={() => setPalette(true)}><PencilSimple />Editar paleta</button>
          </section>

          <section>
            <h4>Ferramentas</h4>
            <div className="grid g1">
              {toolBtn({ kind: 'label' }, <><CursorText />Rótulo{kbd('L')}</>)}
              {toolBtn({ kind: 'river' }, <><Waves />Rio{kbd('R')}</>)}
              {toolBtn({ kind: 'road' }, <><RoadHorizon />Estrada{kbd('D')}</>)}
              {toolBtn({ kind: 'erase' }, <><Eraser />Borracha{kbd('E')}</>)}
              {toolBtn({ kind: 'note' }, <><NotePencil />Nota{kbd('N')}</>)}
              {toolBtn({ kind: 'ruler' }, <><Ruler />Régua{kbd('M')}</>, '', 'Régua: mede hexes e custo')}
              <button className={`secret-mode ${secret ? 'on' : ''}`} aria-pressed={secret}
                title="Ícone, rótulo e borracha passam a valer só para o segredo; terreno continua público"
                onClick={() => setSecretMode(!secret)}>
                <EyeSlash />Modo secreto{kbd('S')}
              </button>
            </div>
          </section>
          </div>
          <div className="side-scroll" role="tabpanel" id="panel-map" aria-labelledby="tab-map" hidden={tab !== 'map'}>
          <section>
            <h4>Imagem de fundo</h4>
            <div className="stack">
              <div className="grid g2">
                <button onClick={() => imgIn.current?.click()}><UploadSimple />Carregar</button>
                <button disabled={!bg} onClick={() => { dispatch({ t: 'snap' }); dispatch({ t: 'edit', fn: (d) => ({ ...d, bg: undefined }) }) }}><Trash />Remover</button>
              </div>
              <input ref={imgIn} type="file" accept="image/*" hidden onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) loadBg(f)
              }} />
              {bg && <>
                  <label className="field">
                    <span>Opacidade {Math.round(bg.opacity * 100)}%</span>
                    <input type="range" min={0} max={1} step={0.05} value={bg.opacity}
                      onChange={(e) => { setBg({ opacity: e.target.valueAsNumber }, !bgSnapped.current); bgSnapped.current = true }}
                      onBlur={() => { bgSnapped.current = false }} />
                  </label>
                  <div className="grid g1">
                    <button className={`primary ${tool.kind === 'adjust' ? 'on' : ''}`} aria-pressed={tool.kind === 'adjust'}
                      title="Arraste para mover a imagem; a roda do mouse muda o tamanho"
                      onClick={() => enter({ kind: 'adjust' })}>
                      <ArrowsOutCardinal />Ajustar fundo (arrastar e zoom)
                    </button>
                    {tool.kind === 'adjust' && <button onClick={() => pick(prevTool.current)}><CheckCircle />Concluir</button>}
                  </div>
                  <details className="calib">
                    <summary>Avançado: medir escala por 2 pontos</summary>
                    <ol>
                      <li>Mais simples: com 1 hex, clique no lado esquerdo de um hex da imagem e no lado direito (o lado oposto) do mesmo hex.</li>
                      <li>Para mais precisão, meça vários hexes: do lado esquerdo do primeiro ao lado direito do último na mesma fileira, e informe quantos hexes são.</li>
                      <li>Só a distância horizontal importa; a altura do clique não. Depois alinhe arrastando em Ajustar fundo.</li>
                    </ol>
                    <div className="grid g1">
                      <label className="field">
                        <span>Hexes entre os dois lados (ex.: 1 ou 10)</span>
                        <input type="number" min={0.1} step={0.5} value={measureText}
                          onChange={(e) => setMeasureText(e.target.value)} />
                      </label>
                      <button className={tool.kind === 'calibrate' ? 'on' : ''} aria-pressed={tool.kind === 'calibrate'}
                        onClick={() => enter({ kind: 'calibrate' })}>
                        <Crosshair />Medir escala
                      </button>
                    </div>
                  </details>
                  <div className="grid g3">{bgField('Escala', 'scale', bg)}{bgField('X', 'x', bg)}{bgField('Y', 'y', bg)}</div>
                  {!bgCovers(bg, doc) && <>
                    <p className="bg-warn" role="status"><Warning weight="fill" />O fundo não cobre todo o mapa ({doc.cols}×{doc.rows})</p>
                    <div className="grid g1">
                      <button title="Reduz colunas e linhas até caberem na imagem (Ctrl+Z desfaz)" onClick={() => {
                        const f = fitMapToBg(bg, doc)
                        dispatch({ t: 'snap' })
                        dispatch({ t: 'edit', fn: (d) => d.bg ? { ...resize(f.cols, f.rows)(d), bg: { ...d.bg, x: f.x, y: f.y } } : d })
                      }}>Adaptar o mapa à imagem</button>
                      <button title="Muda o tamanho da imagem, sem distorcer, até cobrir o mapa; o excesso é cortado (Ctrl+Z desfaz)" onClick={() => {
                        dispatch({ t: 'snap' })
                        dispatch({ t: 'edit', fn: (d) => d.bg ? { ...d, bg: { ...d.bg, ...fitBgToMap(d.bg, d) } } : d })
                      }}>Adaptar a imagem ao mapa</button>
                    </div>
                  </>}
                  {!bg.src && <p className="bg-warn" role="status"><Warning weight="fill" />A imagem não carregou nesta sessão</p>}
              </>}
              <div className="grid g3" role="group" aria-label="Modo do terreno">
                {([['solid', 'Sólido'], ['tint', 'Translúcido'], ['outline', 'Contorno']] as const).map(([s, name]) => {
                  const on = (doc.style ?? 'solid') === s
                  return <button key={s} className={on ? 'on' : ''} aria-pressed={on} onClick={() => {
                    if (on) return
                    dispatch({ t: 'snap' })
                    dispatch({ t: 'edit', fn: (d) => ({ ...d, style: s, hexOpacity: undefined }) }) // o modo volta ao padrão de opacidade
                  }}>{name}</button>
                })}
              </div>
              {(doc.style ?? 'solid') !== 'outline' && (() => {
                const hexOp = doc.hexOpacity ?? (doc.style === 'tint' ? 0.45 : 1)
                return (
                  <label className="field">
                    <span>Opacidade do hex {Math.round(hexOp * 100)}%</span>
                    <input type="range" min={0} max={1} step={0.05} value={hexOp}
                      onChange={(e) => {
                        const hexOpacity = e.target.valueAsNumber
                        if (!hexSnapped.current) dispatch({ t: 'snap' })
                        hexSnapped.current = true
                        dispatch({ t: 'edit', fn: (d) => ({ ...d, hexOpacity }) })
                      }}
                      onBlur={() => { hexSnapped.current = false }} />
                  </label>
                )
              })()}
            </div>
          </section>

          <section>
            <h4>Tamanho do mapa</h4>
            <div className="grid g2">{sizeField('Colunas', 'cols')}{sizeField('Linhas', 'rows')}</div>
          </section>

          <section>
            <h4>Escala</h4>
            <div className="grid g2">
              <label className="field">
                <span>1 hex =</span>
                <input type="number" min={0} step={0.5} key={scale.value} defaultValue={scale.value}
                  onBlur={(e) => {
                    const n = e.target.valueAsNumber
                    if (n > 0 && Number.isFinite(n) && n !== scale.value) setScale({ ...scale, value: n })
                    else e.target.value = String(scale.value)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
              </label>
              <label className="field">
                <span>Unidade</span>
                <input type="text" maxLength={20} key={scale.unit} defaultValue={scale.unit}
                  onBlur={(e) => {
                    const u = e.target.value.trim()
                    if (u && u !== scale.unit) setScale({ ...scale, unit: u })
                    else e.target.value = scale.unit
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
              </label>
            </div>
          </section>
          </div>
          <div className="side-scroll" role="tabpanel" id="panel-file" aria-labelledby="tab-file" hidden={tab !== 'file'}>
          <section>
            <h4>Arquivo</h4>
            <div className="grid g2">
              <button onClick={() => fileIn.current?.click()}><FolderOpen />Abrir</button>
              <button onClick={save} title="Salva o mapa completo, incluindo segredos e notas do mestre"><FloppyDisk />Salvar</button>
              <button onClick={() => setExp({ ...PRESETS.players })}><Image />Exportar…</button>
              <button onClick={() => setConfirmNew(true)}><FilePlus />Novo</button>
            </div>
            <input ref={fileIn} type="file" accept=".json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) loadFile(f).then((d) => dispatch({ t: 'load', doc: d }), (err) => setError(err.message))
            }} />
          </section>
          </div>

        <footer className={`save ${saved ? '' : 'busy'}`} aria-live="polite">
          {saved ? <CheckCircle weight="fill" /> : <CircleNotch className="spin" />}
          {saved ? 'Salvo automaticamente' : 'Salvando…'}
        </footer>
      </aside>

      <main className="work">
        <div className="toolbar" role="group" aria-label="Histórico">
          <button className="icon-btn" disabled={!past.length} title="Desfazer (Ctrl+Z)" aria-label="Desfazer" onClick={() => dispatch({ t: 'undo' })}><ArrowCounterClockwise /></button>
          <button className="icon-btn" disabled={!future.length} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer" onClick={() => dispatch({ t: 'redo' })}><ArrowClockwise /></button>
        </div>
        <MapCanvas doc={doc} dispatch={dispatch} tool={tool} measureHexes={measureHexes} onToolDone={() => pick(prevTool.current)} onMeasured={() => pick({ kind: 'adjust' })} secret={secret} />
        {error && (
          <div className="toast" role="alert">
            <Warning weight="fill" />{error}
            <button className="icon-btn" aria-label="Fechar" onClick={() => setError(undefined)}>×</button>
          </div>
        )}
      </main>
    </div>
  )
}

// diálogo da paleta: 1 snap por abertura (Ctrl+Z desfaz a sessão inteira)
function Palette({ doc, dispatch, onClose }: { doc: MapDoc; dispatch: Dispatch<Action>; onClose: () => void }) {
  const snapped = useRef(false)
  const fileIn = useRef<HTMLInputElement>(null)
  const [glyphFor, setGlyphFor] = useState<string>()
  const [err, setErr] = useState<string>()
  const edit = (fn: (d: MapDoc) => MapDoc) => {
    if (!snapped.current) { snapped.current = true; dispatch({ t: 'snap' }) }
    dispatch({ t: 'edit', fn })
  }
  const remove = (what: string, uses: (h: Hex) => boolean, fn: (d: MapDoc) => MapDoc) => {
    const n = Object.values(doc.hexes).filter(uses).length
    if (n && !confirm(`${n} hexes usam este ${what}; eles ficarão sem ${what}`)) return
    edit(fn)
  }
  const lastT = Object.keys(doc.terrains).length <= 1, lastI = Object.keys(doc.icons).length <= 1

  return (
    <dialog className="modal palette" aria-labelledby="pal-title" ref={(d) => { if (d && !d.open) d.showModal() }} onClose={onClose}>
      <h3 id="pal-title">Paleta</h3>

      <h4>Terrenos</h4>
      {Object.entries(doc.terrains).map(([id, t]) => (
        <div className="pal-row" key={id}>
          <input type="color" aria-label={`Cor de ${t.name}`} value={t.color} onChange={(e) => edit(setTerrain(id, { ...t, color: e.target.value }))} />
          <input className="pal-name" aria-label="Nome do terreno" value={t.name} onChange={(e) => edit(setTerrain(id, { ...t, name: e.target.value }))} />
          <label className="pal-cost">Custo
            <input type="number" step={0.5} min={0} key={t.cost} defaultValue={t.cost}
              onBlur={(e) => {
                const n = e.target.valueAsNumber
                if (n > 0 && n !== t.cost) edit(setTerrain(id, { ...t, cost: n }))
                else e.target.value = String(t.cost)
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          </label>
          <button className="danger" disabled={lastT} onClick={() => remove('terreno', (h) => h.terrain === id, setTerrain(id, null))}>Excluir</button>
        </div>
      ))}
      <button onClick={() => edit(setTerrain(uid(), { name: 'Novo terreno', color: '#888888', cost: 1 }))}><Plus />Novo terreno</button>

      <h4>Ícones</h4>
      {Object.entries(doc.icons).map(([id, def]) => (
        <div key={id}>
          <div className="pal-row">
            <button className="icon" aria-label={`Glifo de ${def.name}: ${def.glyph}`} aria-expanded={glyphFor === id} style={{ color: def.color }}
              onClick={() => setGlyphFor(glyphFor === id ? undefined : id)}><Glyph glyph={def.glyph} /></button>
            <input className="pal-name" aria-label="Nome do ícone" value={def.name} onChange={(e) => edit(setIcon(id, { ...def, name: e.target.value }))} />
            <input type="color" aria-label={`Cor de ${def.name}`} value={def.color ?? '#1a1d24'} onChange={(e) => edit(setIcon(id, { ...def, color: e.target.value }))} />
            {def.color && <button className="icon-btn" aria-label={`Remover cor de ${def.name}`} onClick={() => edit(setIcon(id, { name: def.name, glyph: def.glyph }))}><X /></button>}
            <button className="danger" disabled={lastI} onClick={() => remove('ícone', (h) => h.icon === id || h.secret?.icon === id, setIcon(id, null))}>Excluir</button>
          </div>
          {glyphFor === id && (
            <div className="grid g8" role="group" aria-label={`Glifo de ${def.name}`}>
              {Object.keys(GLYPHS).map((g) => (
                <button key={g} className={`icon ${g === def.glyph ? 'on' : ''}`} aria-label={g} title={g} aria-pressed={g === def.glyph}
                  onClick={() => edit(setIcon(id, { ...def, glyph: g }))}><Glyph glyph={g} /></button>
              ))}
            </div>
          )}
        </div>
      ))}
      <button onClick={() => edit(setIcon(uid(), { name: 'Novo ícone', glyph: 'question' }))}><Plus />Novo ícone</button>

      {err && <p className="pal-err" role="alert">{err}</p>}
      <input ref={fileIn} type="file" accept=".json" hidden onChange={(e) => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (f) loadFile(f).then(
          (p) => { setErr(undefined); edit((d) => ({ ...d, terrains: { ...d.terrains, ...p.terrains }, icons: { ...d.icons, ...p.icons } })) },
          (x) => setErr(x.message))
      }} />
      <div className="modal-actions">
        <button onClick={() => fileIn.current?.click()}><UploadSimple />Importar paleta de um .json</button>
        <button autoFocus onClick={onClose}>Fechar</button>
      </div>
    </dialog>
  )
}
