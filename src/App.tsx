import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { forgetGeometry } from '@/lib/window-geometry'
import { DesktopWindow } from './components/desktop/DesktopWindow'
import type { AppItem } from './components/desktop/types'
import Dashboard from './components/layout/Dashboard'
import { useMiniAppChanges } from './hooks/useMiniAppChanges'
import { type DeskWindow, useWindows, WindowsProvider } from './hooks/useWindows'

// The mini app runtime (Sucrase, ctx.ui) and the editor load on demand,
// so the desktop paints first. The runtime is fetched right after that.
const loadRenderer = () => import('./components/tools/MiniAppRenderer')
const MiniAppRenderer = lazy(loadRenderer)
const MiniAppViewer = lazy(() => import('./components/tools/MiniAppViewer'))
const AboutWindow = lazy(() => import('./components/tools/AboutWindow'))

function WindowFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-(--color-primary) border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

/** A list row from `list_mini_apps`. */
export interface MiniAppInfo extends AppItem {
  category: string
}

function windowLabel(w: DeskWindow, app: MiniAppInfo | undefined) {
  if (w.kind === 'about') return { title: 'Nonla Desk', icon: undefined, iconSvg: null }
  const name = app?.name ?? 'Mini app'
  return {
    title: w.kind === 'info' ? `${name} — Details` : name,
    icon: app?.icon ?? 'Box',
    iconSvg: app?.iconSvg ?? null,
  }
}

function AppShell() {
  const { windows, focused, open, close, closeApp, focus, toggleExpand } = useWindows()
  const [miniApps, setMiniApps] = useState<MiniAppInfo[]>([])
  const [loading, setLoading] = useState(true)

  // One list for the desktop, the windows and their titles.
  const loadMiniApps = useCallback(async () => {
    try {
      setMiniApps((await api.listMiniApps()) || [])
    } catch {
      // keep the last list
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadMiniApps()
    const t = window.setTimeout(() => void loadRenderer(), 200)
    return () => clearTimeout(t)
  }, [loadMiniApps])

  useMiniAppChanges((event) => {
    void loadMiniApps()
    if (event.action === 'deleted') {
      closeApp(event.id)
      forgetGeometry(`app:${event.id}`)
      forgetGeometry(`info:${event.id}`)
    }
  })

  // Menu bar items, the tray and `nonladesk open` ask for a route. Like clicking a
  // desktop icon, a disabled app opens its details instead of an empty window.
  const miniAppsRef = useRef(miniApps)
  miniAppsRef.current = miniApps
  useEffect(() => {
    return api.onNavigateTool(async (tool: string) => {
      if (tool === 'about') {
        open('about')
        return
      }
      if (tool === 'import') {
        window.dispatchEvent(new Event('nonla:import'))
        return
      }
      if (!tool.startsWith('mini/')) return
      const id = tool.slice('mini/'.length)
      let app = miniAppsRef.current.find((a) => a.id === id)
      if (!app) app = ((await api.listMiniApps()) as MiniAppInfo[]).find((a) => a.id === id)
      if (app?.enabled && app.standalone) {
        void api.openStandalone(id)
        return
      }
      open(app && !app.enabled ? 'info' : 'app', id)
    })
  }, [open])

  // Shift+↑ expands or restores the focused window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!focused || !e.shiftKey || e.key !== 'ArrowUp') return
      e.preventDefault()
      toggleExpand(focused.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focused, toggleExpand])

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <Dashboard apps={miniApps} loading={loading} loadApps={loadMiniApps} />

      {/* Windows open below the top bar (h-11); each gets its own stacking layer. */}
      <main className="absolute inset-x-0 top-11 bottom-0 z-30 pointer-events-none">
        {windows.map((w) => {
          const app = w.appId ? miniApps.find((a) => a.id === w.appId) : undefined
          const label = windowLabel(w, app)
          return (
            <div
              key={w.key}
              className="absolute inset-0 pointer-events-none"
              style={{ zIndex: w.z }}
            >
              <DesktopWindow
                title={label.title}
                icon={label.icon}
                iconSvg={label.iconSvg}
                expanded={w.expanded}
                focused={focused?.key === w.key}
                slot={w.slot}
                persistKey={w.key}
                originId={w.kind === 'about' ? 'nonla-about' : w.appId}
                onFocus={() => focus(w.key)}
                onClose={() => close(w.key)}
                onToggleExpand={() => toggleExpand(w.key)}
              >
                <div className="h-full overflow-hidden">
                  <Suspense fallback={<WindowFallback />}>
                    {w.kind === 'about' ? (
                      <AboutWindow />
                    ) : w.kind === 'app' && w.appId ? (
                      <MiniAppRenderer appId={w.appId} />
                    ) : (
                      <MiniAppViewer appId={w.appId ?? ''} />
                    )}
                  </Suspense>
                </div>
              </DesktopWindow>
            </div>
          )
        })}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <WindowsProvider>
      <AppShell />
    </WindowsProvider>
  )
}
