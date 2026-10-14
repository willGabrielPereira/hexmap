import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadLocal } from './persist'

// boot assíncrono: espera o IndexedDB no máximo ~2 s (withTimeout em kv.get)
loadLocal().then(({ doc, bad, missing }) => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App initial={doc} bad={bad} missing={missing} />
  </StrictMode>,
))
