import { AlertCircle, AlertTriangle, Box, ShieldOff } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { buildFrontendContext, evaluateComponent } from '../../lib/miniapp-helpers'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MiniAppData {
  id: string
  name: string
  frontendCode: string
  panelCode: string | null
}

interface MiniAppRendererProps {
  appId: string
}

// ─── Error Boundary ──────────────────────────────────────────────────────────

class MiniAppErrorBoundary extends React.Component<
  { appId: string; appName: string; children: React.ReactNode },
  { hasError: boolean; error: Error | null; disabled: boolean }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false, error: null, disabled: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[MiniApp:${this.props.appName}] Render error:`, error, info)
  }

  handleDisable = () => {
    window.api?.toggleMiniApp(this.props.appId).then(() => {
      this.setState({ disabled: true })
    })
  }

  render() {
    if (this.state.disabled) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
          <div className="w-12 h-12 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <ShieldOff size={24} className="text-amber-400" />
          </div>
          <div className="text-center">
            <h3 className="text-sm font-semibold text-(--color-ink) mb-1">
              &quot;{this.props.appName}&quot; has been disabled
            </h3>
            <p className="text-xs text-(--color-mute) max-w-md">
              The app was disabled due to a runtime error. You can re-enable it from the Mini Apps
              manager after reviewing the code.
            </p>
          </div>
        </div>
      )
    }

    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
          <div className="w-12 h-12 rounded-md bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-400" />
          </div>
          <div className="text-center">
            <h3 className="text-sm font-semibold text-(--color-ink) mb-1">
              Mini App Error: {this.props.appName}
            </h3>
            <p className="text-xs text-(--color-mute) max-w-md">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
          </div>
          <pre className="text-[11px] font-mono text-red-400/80 bg-(--color-canvas-soft) border border-(--color-hairline) rounded-md p-3 max-w-lg max-h-40 overflow-auto w-full">
            {this.state.error?.stack || ''}
          </pre>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-xs font-semibold text-(--color-primary) hover:underline cursor-pointer bg-transparent border-none"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try Again
            </button>
            <button
              type="button"
              className="text-xs font-semibold text-red-400 hover:underline cursor-pointer bg-transparent border-none"
              onClick={this.handleDisable}
            >
              Disable App
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// ─── Main Renderer Component ─────────────────────────────────────────────────

export default function MiniAppRenderer({ appId }: MiniAppRendererProps) {
  const [appData, setAppData] = useState<MiniAppData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const ctxRef = useRef<ReturnType<typeof buildFrontendContext> | null>(null)
  const componentRef = useRef<React.ComponentType<any> | null>(null)
  const panelComponentRef = useRef<React.ComponentType<any> | null>(null)

  // Load app data from main process
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    window.api
      ?.getMiniApp(appId)
      .then((data: any) => {
        if (cancelled) return
        if (!data) {
          setError('Mini app not found')
          setLoading(false)
          return
        }
        setAppData(data)

        // Build context and evaluate code
        const ctx = buildFrontendContext(appId)
        ctxRef.current = ctx

        const MainComponent = evaluateComponent(data.frontendCode, ctx)
        componentRef.current = MainComponent

        if (data.panelCode) {
          const PanelComponent = evaluateComponent(data.panelCode, ctx)
          panelComponentRef.current = PanelComponent
        } else {
          panelComponentRef.current = null
        }

        setLoading(false)
      })
      .catch((e: any) => {
        if (cancelled) return
        setError(e.message || 'Failed to load mini app')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [appId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3">
        <div className="w-5 h-5 border-2 border-(--color-primary) border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-(--color-mute)">Loading mini app...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertCircle size={32} className="text-red-400" />
        <span className="text-sm text-(--color-ink)">{error}</span>
      </div>
    )
  }

  if (!componentRef.current || !appData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Box size={32} className="text-(--color-mute)" />
        <span className="text-sm text-(--color-mute)">This mini app has no frontend UI</span>
      </div>
    )
  }

  const MainComponent = componentRef.current
  const ctx = ctxRef.current!

  // Panel code is only used in the tray popup (Quick Tools), not rendered here
  return (
    <MiniAppErrorBoundary appId={appId} appName={appData.name}>
      <MainComponent ctx={ctx} />
    </MiniAppErrorBoundary>
  )
}
