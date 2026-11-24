import { message, App as NonlaApp, setColorPreference } from 'devnonla-ui'
import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { initAOS } from './hooks/useAnimations'
import './assets/index.css'
import { api, windowLabel } from './lib/api'
import { MINIAPP_TAILWIND_SAFELIST } from './lib/miniapp-tailwind-safelist'

void MINIAPP_TAILWIND_SAFELIST

// The desktop is light-only (see .cursor/DESIGN.md).
setColorPreference('light')

// Mini apps can use data-aos attributes for entrance animations.
initAOS()

const isTrayPanel = windowLabel() === 'tray'
// Each window loads only its own UI.
const Root = lazy(() => (isTrayPanel ? import('./components/tray/TrayPanel') : import('./App')))
if (isTrayPanel) document.documentElement.classList.add('tray')

// `nonla check` runs here so it uses the same transpiler as the renderer.
if (!isTrayPanel) {
  api.onCheckRequest(async ({ requestId, files }) => {
    const { checkMiniApp } = await import('./lib/miniapp-check')
    void api.sendCheckResult(requestId, checkMiniApp(files))
  })

  // In-app update download/install (src-tauri/src/updater.rs).
  api.onUpdateProgress(({ text }) => {
    if (text) message.open({ key: 'update', type: 'loading', content: text, duration: 0 })
    else message.destroy('update')
  })

  // A mini app has a backend but neither Bun nor Node.js is installed.
  api.onRuntimeMissing(() => {
    message.open({
      key: 'runtime-missing',
      type: 'warning',
      duration: 0,
      content: 'Mini app backends need Bun. Install it: curl -fsSL https://bun.sh/install | bash',
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <NonlaApp className="h-full">
      <Suspense fallback={null}>
        <Root />
      </Suspense>
    </NonlaApp>
  </React.StrictMode>,
)
