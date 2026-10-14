import { useEffect, useReducer, useRef, useState } from 'react'
import {
  ArrowClockwise, ArrowCounterClockwise, CheckCircle, CircleNotch, CursorText, Eraser, FilePlus, FolderOpen,
  FloppyDisk, Hexagon, Image, RoadHorizon, Warning, Waves,
} from '@phosphor-icons/react'
import { MapCanvas } from './MapCanvas'
import { FEATURES } from './icons'
import { TERRAINS } from './palette'
import { exportPng, loadFile, loadLocal, saveFile, saveLocal } from './persist'
import { emptyDoc, init, reducer, resize } from './store'
import type { Tool } from './types'

const same = (a: Tool, b: Tool) => a.kind === b.kind && (!('id' in a) || ('id' in b && a.id === b.id))
const clamp = (n: number) => Math.min(80, Math.max(5, Math.round(n) || 5))

export default function App() {
  const [{ doc, past, future }, dispatch] = useReducer(reducer, undefined, () => init(loadLocal()))
  const [tool, setTool] = useState<Tool>({ kind: 'terrain', id: 'plains' })
  const [savedDoc, setSavedDoc] = useState(doc)
  const saved = savedDoc === doc
  const [confirmNew, setConfirmNew] = useState(false)
  const [error, setError] = useState<string>()
  const last = useRef({ terrain: 'plains', icon: 'castle' })
  const fileIn = useRef<HTMLInputElement>(null)

  const pick = (t: Tool) => {
    if (t.kind === 'terrain') last.current.terrain = t.id
    if (t.kind === 'icon') last.current.icon = t.id
    setTool(t)
  }

  useEffect(() => {
    const t = setTimeout(() => { saveLocal(doc); setSavedDoc(doc) }, 300) // autosave
    return () => clearTimeout(t)
  }, [doc])

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(undefined), 5000)
    return () => clearTimeout(t)
  }, [error])

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return
      const k = e.key.toLowerCase()
      if (e.ctrlKey || e.metaKey) {
        if (k === 'z') { e.preventDefault(); dispatch({ t: e.shiftKey ? 'redo' : 'undo' }) }
        else if (k === 'y') { e.preventDefault(); dispatch({ t: 'redo' }) }
        return
      }
      if (e.altKey) return
      const l = last.current
      const t: Tool | undefined = {
        b: { kind: 'terrain', id: l.terrain }, i: { kind: 'icon', id: l.icon }, l: { kind: 'label' },
        r: { kind: 'river' }, d: { kind: 'road' }, e: { kind: 'erase' },
      }[k] as Tool | undefined
      if (t) pick(t)
    }
    window.addEventListener('keydown', kd)
    return () => window.removeEventListener('keydown', kd)
  }, [])

  const toolBtn = (t: Tool, content: React.ReactNode, cls = '', title?: string) => {
    const on = same(tool, t)
    return (
      <button key={'id' in t ? t.kind + t.id : t.kind} className={`${cls} ${on ? 'on' : ''}`} aria-pressed={on} title={title} onClick={() => pick(t)}>
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

  const newMap = () => { dispatch({ t: 'load', doc: emptyDoc() }); setConfirmNew(false) }

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
      <aside>
        <header className="brand">
          <Hexagon weight="fill" size={22} />
          <span>Hexmap</span>
        </header>

        <div className="side-scroll">
          <section>
            <h4>Arquivo</h4>
            <div className="grid g2">
              <button onClick={() => fileIn.current?.click()}><FolderOpen />Abrir</button>
              <button onClick={() => saveFile(doc)}><FloppyDisk />Salvar</button>
              <button onClick={() => exportPng(doc)}><Image />Exportar PNG</button>
              <button onClick={() => setConfirmNew(true)}><FilePlus />Novo</button>
            </div>
            <input ref={fileIn} type="file" accept=".json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) loadFile(f).then((d) => dispatch({ t: 'load', doc: d }), (err) => setError(err.message))
            }} />
          </section>

          <section>
            <h4>Tamanho do mapa</h4>
            <div className="grid g2">{sizeField('Colunas', 'cols')}{sizeField('Linhas', 'rows')}</div>
          </section>

          <section>
            <h4>Terreno {kbd('B')}</h4>
            <div className="grid g2">
              {Object.entries(TERRAINS).map(([id, t]) =>
                toolBtn({ kind: 'terrain', id }, <><i className="sw" style={{ background: t.color }} />{t.name}</>))}
            </div>
          </section>

          <section>
            <h4>Ícones {kbd('I')}</h4>
            <div className="grid g6">
              {Object.entries(FEATURES).map(([id, { name, C }]) =>
                toolBtn({ kind: 'icon', id }, <C size={20} weight="fill" aria-label={name} />, 'icon', name))}
            </div>
          </section>

          <section>
            <h4>Ferramentas</h4>
            <div className="grid g1">
              {toolBtn({ kind: 'label' }, <><CursorText />Rótulo{kbd('L')}</>)}
              {toolBtn({ kind: 'river' }, <><Waves />Rio{kbd('R')}</>)}
              {toolBtn({ kind: 'road' }, <><RoadHorizon />Estrada{kbd('D')}</>)}
              {toolBtn({ kind: 'erase' }, <><Eraser />Borracha{kbd('E')}</>)}
            </div>
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
        <MapCanvas doc={doc} dispatch={dispatch} tool={tool} />
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

