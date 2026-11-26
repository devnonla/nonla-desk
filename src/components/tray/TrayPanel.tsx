import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import desktopBackground from '@/assets/desktop-bg.jpg'
import { ChevronLeft } from '@/components/ui/icons'
import { api } from '@/lib/api'
import { useMiniAppChanges } from '../../hooks/useMiniAppChanges'
import { buildFrontendContext, evaluateComponent, loadModulesFor } from '../../lib/miniapp-helpers'
import { AppIcon } from '../desktop/AppIcon'
import { DesktopClock } from '../desktop/DesktopClock'
import { iconButtonClass, labelClass, plateClass } from '../desktop/DesktopIcon'

// ─── Mini App Panel Renderer ─────────────────────────────────────────────────

function MiniAppPanelView({ appId, panelCode }: { appId: string; panelCode: string }) {
  const ctxRef = useRef<ReturnType<typeof buildFrontendContext> | null>(null)
  const [PanelComp, setPanelComp] = useState<React.ComponentType<any> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const modules = await loadModulesFor(panelCode)
        if (cancelled) return
        const ctx = buildFrontendContext(appId)
        ctxRef.current = ctx
        const Comp = evaluateComponent(panelCode, ctx, modules)
        if (Comp) {
          setPanelComp(() => Comp)
        } else {
          setError('Panel returned no component')
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load panel')
      }
    })()
    return () => {
      cancelled = true
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
  iconName: string
  iconSvg: string | null
}

interface MiniAppPanelInfo {
  id: string
  name: string
  icon: string
  iconSvg: string | null
  panelCode: string
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TrayPanel() {
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [miniAppPanels, setMiniAppPanels] = useState<MiniAppPanelInfo[]>([])
  // Inside a native app's own menu bar icon: its panel only. undefined = not known yet.
  const [soloId, setSoloId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    void api.soloAppId().then(setSoloId)
  }, [])

  // Load mini apps with panel code
  const loadPanels = useCallback(async () => {
    if (soloId === undefined) return
    try {
      const list = await api.listMiniApps()
      if (!list) return
      // Apps installed as native apps show their panel in their own menu bar icon.
      const withPanels = list.filter((a: any) =>
        soloId
          ? a.id === soloId && a.enabled && a.hasPanel
          : a.enabled && a.hasPanel && !a.standalone,
      )
      if (withPanels.length === 0) {
        setMiniAppPanels([])
        return
      }
      // Fetch full data for each to get panelCode
      const details = await Promise.all(withPanels.map((a: any) => api.getMiniApp(a.id)))
      setMiniAppPanels(
        details
          .filter((d: any) => d?.panelCode)
          .map((d: any) => ({
            id: d.id,
            name: d.name,
            icon: d.icon,
            iconSvg: d.iconSvg,
            panelCode: d.panelCode,
          })),
      )
    } catch {
      // silently fail
    }
  }, [soloId])

  useEffect(() => {
    loadPanels()
  }, [loadPanels])

  // A native app has one panel: show it straight away.
  useEffect(() => {
    if (soloId && miniAppPanels.some((a) => a.id === soloId)) setActiveTool(soloId)
  }, [soloId, miniAppPanels])

  useMiniAppChanges((event) => {
    void loadPanels()
    if (!activeTool || soloId) return
    if (event.id === activeTool && (event.action === 'deleted' || event.enabled === false)) {
      setActiveTool(null)
    }
  })

  // Reload when tray becomes visible (so toggle changes in main window are reflected instantly)
  useEffect(() => {
    const cleanup = api.onTrayVisibilityChange((visible: boolean) => {
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
        icon: <AppIcon name={app.icon} svg={app.iconSvg} size={16} />,
        iconName: app.icon,
        iconSvg: app.iconSvg,
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

  const headerText = 'text-[12px] font-semibold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]'

  return (
    <div className="w-full h-full font-sans bg-transparent">
      {/* Same wallpaper as the desktop, edge to edge. */}
      <div className="relative size-full rounded-xl overflow-hidden flex flex-col">
        <img
          src={desktopBackground}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-cover object-center pointer-events-none select-none"
        />

        {/* Liquid glass edge on the two sides and the bottom: a thin light rim with a faint inner glow. None on top. */}
        <div
          aria-hidden
          className="absolute inset-0 z-20 rounded-xl pointer-events-none shadow-[inset_1px_0_0_rgba(255,255,255,0.4),inset_-1px_0_0_rgba(255,255,255,0.4),inset_0_-1px_0_rgba(255,255,255,0.5),inset_10px_0_12px_-10px_rgba(255,255,255,0.18),inset_-10px_0_12px_-10px_rgba(255,255,255,0.18),inset_0_-10px_12px_-10px_rgba(255,255,255,0.22)]"
        />

        {/* Header: no bar, just the title over the wallpaper. The list needs none. */}
        {(soloId || activeTool) && (
          <div className="relative z-10 h-9 shrink-0 px-3 flex items-center">
            {soloId ? (
              <div className={`flex items-center gap-2 select-none ${headerText}`}>
                {allTools[0]?.icon}
                <span>{activeLabel}</span>
              </div>
            ) : (
              <button
                type="button"
                className={`flex items-center gap-1.5 cursor-pointer select-none border-none bg-transparent p-0 transition-opacity duration-150 hover:opacity-80 ${headerText}`}
                onClick={() => setActiveTool(null)}
              >
                <ChevronLeft size={12} />
                <span>{activeLabel}</span>
              </button>
            )}
          </div>
        )}

        <div className="relative z-10 flex-1 min-h-0 overflow-y-auto">
          {activeTool ? (
            // A mini app's panel fills the rest edge to edge, on a light sheet: it is drawn for a light background.
            <div className="min-h-full bg-(--color-canvas) border-t border-(--color-hairline)">
              {renderContent()}
            </div>
          ) : allTools.length === 0 ? (
            <DesktopClock compact />
          ) : (
            // Icons like on the desktop.
            <div className="grid grid-cols-3 content-start gap-y-2 px-2 py-3">
              {allTools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  title={tool.label}
                  className={`${iconButtonClass} justify-self-center`}
                  onClick={() => setActiveTool(tool.id)}
                >
                  <span className={plateClass(Boolean(tool.iconSvg))}>
                    <AppIcon
                      name={tool.iconName}
                      svg={tool.iconSvg}
                      size={tool.iconSvg ? 48 : 28}
                    />
                  </span>
                  <span className={labelClass(false)}>{tool.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
