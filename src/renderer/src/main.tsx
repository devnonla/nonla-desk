import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import TrayPanel from './components/tray/TrayPanel'
import { initAOS } from './hooks/useAnimations'
import './assets/index.css'
import { MINIAPP_TAILWIND_SAFELIST } from './lib/miniapp-tailwind-safelist'

void MINIAPP_TAILWIND_SAFELIST

// Initialize AOS — mini apps can use data-aos attributes for entrance animations
initAOS()

// Detect if this is the tray panel window
const params = new URLSearchParams(window.location.search)
const isTrayPanel = params.get('panel') === 'tray'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isTrayPanel ? (
      <TrayPanel />
    ) : (
      <HashRouter>
        <App />
      </HashRouter>
    )}
  </React.StrictMode>,
)
