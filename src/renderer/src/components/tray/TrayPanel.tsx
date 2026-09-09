import { ChevronLeft, LayoutGrid } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMiniAppChanges } from '../../hooks/useMiniAppChanges'
import { buildFrontendContext, evaluateComponent } from '../../lib/miniapp-helpers'
import { AppIcon } from '../desktop/AppIcon'
import AppLogo from '../ui/AppLogo'

// ─── Mini App Panel Renderer ─────────────────────────────────────────────────

function MiniAppPanelView({ appId, panelCode }: { appId: string; panelCode: string }) {
  const ctxRef = useRef<ReturnType<typeof buildFrontendContext> | null>(null)
  const [PanelComp, setPanelComp] = useState<React.ComponentType<any> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const ctx = buildFrontendContext(appId)
      ctxRef.current = ctx
      const Comp = evaluateComponent(panelCode, ctx)
      if (Comp) {
        setPanelComp(() => Comp)
      } else {
        setError('Panel returned no component')
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load panel')
    }
  }, [appId, panelCode])

  if (error) {
    return <div className="p-3 text-xs text-red-400">Panel error: {error}</div>
  }

  if (!PanelComp || !ctxRef.current) {
    return <div className="p-3 text-xs text-(--color-mute)">Loading...</div>
  }

  return <PanelComp ctx={ctxRef.current} />
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface TrayTool {
  id: string
  label: string
  icon: React.ReactNode
}

interface MiniAppPanelInfo {
  id: string
  name: string
  icon: string
  panelCode: string
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TrayPanel() {
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [miniAppPanels, setMiniAppPanels] = useState<MiniAppPanelInfo[]>([])

  // Load mini apps with panel code
  const loadPanels = useCallback(async () => {
    try {
      const list = await window.api?.listMiniApps()
      if (!list) return
      const withPanels = list.filter((a: any) => a.enabled && a.hasPanel)
      if (withPanels.length === 0) {
        setMiniAppPanels([])
        return
      }
      // Fetch full data for each to get panelCode
      const details = await Promise.all(withPanels.map((a: any) => window.api?.getMiniApp(a.id)))
      setMiniAppPanels(
        details
          .filter((d: any) => d?.panelCode)
          .map((d: any) => ({
            id: d.id,
            name: d.name,
            icon: d.icon,
            panelCode: d.panelCode,
          })),
      )
    } catch {
      // silently fail
    }
  }, [])

  useEffect(() => {
    loadPanels()
  }, [loadPanels])

  useMiniAppChanges((event) => {
    void loadPanels()
    if (!activeTool) return
    if (event.id === activeTool && (event.action === 'deleted' || event.enabled === false)) {
      setActiveTool(null)
    }
  })

  // Reload when tray becomes visible (so toggle changes in main window are reflected instantly)
  useEffect(() => {
    const cleanup = window.api?.onTrayVisibilityChange((visible: boolean) => {
      if (visible) {
        loadPanels()
      }
    })
    return () => cleanup?.()
  }, [loadPanels])

  // Build tool list from mini apps with panels
  const allTools: TrayTool[] = useMemo(() => {
    return miniAppPanels.map((app) => {
      return {
        id: app.id,
        label: app.name,
        icon: <AppIcon name={app.icon} size={16} />,
      }
    })
  }, [miniAppPanels])

  const activeLabel = activeTool ? allTools.find((t) => t.id === activeTool)?.label : null

  // Render content for active tool
  const renderContent = useCallback(() => {
    if (!activeTool) return null
    const app = miniAppPanels.find((a) => a.id === activeTool)
    if (app) {
      return <MiniAppPanelView appId={app.id} panelCode={app.panelCode} />
    }
    return <div className="p-3 text-xs text-(--color-mute)">Tool not found</div>
  }, [activeTool, miniAppPanels])

  return (
    <div className="w-full h-full flex flex-col items-center p-0 font-sans bg-transparent">
      <div className="flex-1 w-full bg-(--color-canvas) rounded-xl border border-(--color-hairline) overflow-hidden flex flex-col">
        {/* Header */}
        <div className="py-2.5 px-3 border-b border-(--color-hairline) flex items-center">
          {activeTool ? (
            <div
              className="flex items-center gap-1.5 text-[13px] font-semibold text-(--color-ink) cursor-pointer transition-colors duration-150 select-none hover:text-(--color-primary-deep)"
              onClick={() => setActiveTool(null)}
            >
              <ChevronLeft size={12} />
              <span>{activeLabel}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <AppLogo size={20} />
              <span className="text-[13px] font-bold text-(--color-primary)">Nonla Desk</span>
            </div>
          )}
        </div>

        <div
          className={`flex-1 overflow-y-auto ${activeTool || allTools.length === 0 ? 'p-3' : 'px-1.5 py-1'}`}
        >
          {activeTool ? (
            renderContent()
          ) : allTools.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-md bg-(--color-canvas-soft) border border-(--color-hairline) flex items-center justify-center mb-4">
                <LayoutGrid size={22} className="text-(--color-mute)" />
              </div>
              <span className="text-sm font-medium text-(--color-ink) mb-1">No active panels</span>
              <span className="text-[11px] text-(--color-mute) leading-relaxed max-w-60">
                Enable a mini app with a panel component to see its quick tools here.
              </span>
              <div className="mt-4 px-3 py-2 rounded-sm border border-dashed border-(--color-hairline) bg-(--color-canvas-soft)">
                <span className="text-[10px] text-(--color-mute) leading-relaxed">
                  Open the app window to enable apps with a panel component.
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {allTools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md cursor-pointer select-none text-left transition-colors duration-100 hover:bg-(--color-canvas-soft)"
                  onClick={() => setActiveTool(tool.id)}
                >
                  <span className="w-5 h-5 flex items-center justify-center shrink-0">
                    {tool.icon}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-(--color-ink)">
                    {tool.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
