import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { DesktopWindow } from './components/desktop/DesktopWindow'
import Dashboard from './components/layout/Dashboard'
import MiniAppEditor from './components/tools/MiniAppEditor'
import MiniAppRenderer from './components/tools/MiniAppRenderer'
import Settings from './components/tools/Settings'
import { ConfirmProvider } from './components/ui/ConfirmDialog'
import { ToastProvider } from './components/ui/Toast'

function MiniAppRoute() {
  const { appId } = useParams<{ appId: string }>()
  if (!appId) return null
  return <MiniAppRenderer appId={appId} />
}

export interface MiniAppInfo {
  id: string
  name: string
  description: string
  icon: string
  category: string
  enabled: boolean
}

function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const [miniApps, setMiniApps] = useState<MiniAppInfo[]>([])
  const [expandedFor, setExpandedFor] = useState<string | null>(null)

  const activeTool = location.pathname.replace(/^\//, '') || ''
  const isHome = !activeTool

  const loadMiniApps = useCallback(async () => {
    try {
      const list = await window.api?.listMiniApps()
      setMiniApps(list || [])
    } catch {
      // silently fail
    }
  }, [])

  useEffect(() => {
    if (!location.pathname) return
    loadMiniApps()
  }, [loadMiniApps, location.pathname])

  useEffect(() => {
    const cleanupNav = window.api?.onNavigateTool((tool: string) => {
      navigate(tool ? `/${tool}` : '/')
    })
    return () => {
      cleanupNav?.()
    }
  }, [navigate])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isHome) return

      if (e.shiftKey && e.key === 'ArrowUp') {
        e.preventDefault()
        setExpandedFor((current) => (current === location.pathname ? null : location.pathname))
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isHome, location.pathname])

  const miniAppMatch = activeTool.startsWith('mini/') ? activeTool.replace('mini/', '') : null
  const editAppId = activeTool.startsWith('mini-apps/edit/')
    ? activeTool.replace('mini-apps/edit/', '')
    : null
  const windowApp =
    (miniAppMatch ? miniApps.find((a) => a.id === miniAppMatch) : null) ||
    (editAppId ? miniApps.find((a) => a.id === editAppId) : null)

  const windowTitle = windowApp
    ? windowApp.name
    : activeTool === 'mini-apps/new'
      ? 'New App'
      : activeTool === 'settings'
        ? 'Settings'
        : null

  const windowIcon = windowApp
    ? windowApp.icon
    : activeTool === 'mini-apps/new'
      ? 'Plus'
      : activeTool === 'settings'
        ? 'Settings'
        : undefined

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <div className="h-(--header-height) flex items-center px-4 pl-19.5 bg-(--color-titlebar) [-webkit-app-region:drag] shrink-0 z-20">
        <span className="text-[13px] font-semibold text-(--color-ink) [-webkit-app-region:drag]">
          Nonla Desk
        </span>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden bg-[#4f7a32]">
        <main className="flex-1 min-w-0 relative overflow-hidden">
          <Dashboard />

          {!isHome && (
            <DesktopWindow
              key={location.pathname}
              title={windowTitle || undefined}
              icon={windowIcon}
              expanded={expandedFor === location.pathname}
              onClose={() => navigate('/')}
              onToggleExpand={() =>
                setExpandedFor((current) =>
                  current === location.pathname ? null : location.pathname,
                )
              }
            >
              <Routes>
                <Route
                  path="/mini/:appId"
                  element={
                    <div className="h-full overflow-hidden">
                      <MiniAppRoute />
                    </div>
                  }
                />
                <Route path="/mini-apps" element={<Navigate to="/" replace />} />
                <Route
                  path="/mini-apps/new"
                  element={
                    <div className="h-full overflow-hidden">
                      <MiniAppEditor />
                    </div>
                  }
                />
                <Route
                  path="/mini-apps/edit/:appId"
                  element={
                    <div className="h-full overflow-hidden">
                      <MiniAppEditor />
                    </div>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <div className="h-full overflow-y-auto p-6">
                      <Settings />
                    </div>
                  }
                />
              </Routes>
            </DesktopWindow>
          )}
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppShell />
      </ConfirmProvider>
    </ToastProvider>
  )
}
