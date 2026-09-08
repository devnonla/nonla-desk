import { ChevronLeft, LayoutGrid } from 'lucide-react'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  desc: string
  icon: React.ReactNode
}

interface MiniAppPanelInfo {
  id: string
  name: string
  icon: string
  description: string
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
            description: d.description,
            panelCode: d.panelCode,
          })),
      )
    } catch {
      // silently fail
    }
  }, [])

  // Load on mount
  useEffect(() => {
    loadPanels()
  }, [loadPanels])

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
        desc: app.description || 'Mini App',
        icon: <AppIcon name={app.icon} size={18} />,
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
              className="flex items-center gap-1.5 text-xs font-medium text-(--color-primary-soft) cursor-pointer transition-colors duration-150 select-none hover:text-(--color-primary)"
              onClick={() => setActiveTool(null)}
            >
              <ChevronLeft size={12} />
              <span>{activeLabel}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <AppLogo size={20} />
              <span className="text-[13px] font-bold text-(--color-primary)">Nonla Desk</span>
              <span className="text-[11px] text-(--color-mute)">Quick Tools</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
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
            <div className="flex flex-col gap-1.5">
              {allTools.map((tool) => (
                <div
                  key={tool.id}
                  className="flex items-center gap-3 p-3 bg-(--color-canvas-soft) border border-(--color-hairline) rounded-md cursor-pointer transition-all duration-150 select-none hover:border-(--color-primary)"
                  onClick={() => setActiveTool(tool.id)}
                >
                  <div className="w-9 h-9 flex items-center justify-center rounded-md bg-(--color-primary-glow) text-(--color-primary-soft) text-base shrink-0">
                    {tool.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-(--color-ink)">{tool.label}</div>
                    <div className="text-[11px] text-(--color-mute) mt-px">{tool.desc}</div>
                  </div>
                  <div className="text-lg text-(--color-mute) shrink-0">›</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
