import { AlertTriangle } from 'lucide-react'
import { type ReactNode, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConfirmConfig {
  title: string
  content: ReactNode
  okText?: string
  cancelText?: string
  okButtonProps?: { danger?: boolean }
  onOk?: () => void | Promise<void>
  onCancel?: () => void
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let showConfirmFn: ((config: ConfirmConfig) => void) | null = null

export function confirm(config: ConfirmConfig) {
  showConfirmFn?.(config)
}

// ─── Dialog Component ────────────────────────────────────────────────────────

function ConfirmDialogView({ config, onClose }: { config: ConfirmConfig; onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const isDanger = config.okButtonProps?.danger

  const handleOk = async () => {
    setLoading(true)
    try {
      await config.onOk?.()
    } finally {
      setLoading(false)
      onClose()
    }
  }

  const handleCancel = () => {
    config.onCancel?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-9998 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCancel} />
      {/* Dialog */}
      <div className="relative z-10 w-full max-w-sm bg-(--color-canvas) border border-(--color-hairline) rounded-md shadow-[0_20px_60px_rgba(0,0,0,0.7),0_0_0_1px_rgba(148,163,184,0.1)_inset] overflow-hidden">
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div
              className={`w-8 h-8 rounded-sm flex items-center justify-center shrink-0 ${
                isDanger
                  ? 'bg-(--color-error)/10 border border-(--color-error)/20'
                  : 'bg-(--color-warning)/10 border border-(--color-warning)/20'
              }`}
            >
              <AlertTriangle
                size={16}
                className={isDanger ? 'text-(--color-error)' : 'text-(--color-warning)'}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-(--color-ink) mb-1">{config.title}</h3>
              <div className="text-[12px] text-(--color-body) leading-relaxed">
                {config.content}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-(--color-hairline) bg-(--color-canvas-soft)">
          <button
            type="button"
            className="h-8 px-4 text-[13px] font-medium rounded-sm bg-transparent border border-(--color-hairline) text-(--color-body) cursor-pointer transition-colors hover:bg-(--color-bg-hover) hover:text-(--color-ink)"
            onClick={handleCancel}
            disabled={loading}
          >
            {config.cancelText || 'Cancel'}
          </button>
          <button
            type="button"
            className={`h-8 px-4 text-[13px] font-semibold rounded-sm border-none cursor-pointer transition-all disabled:opacity-50 ${
              isDanger
                ? 'bg-(--color-error) text-white hover:opacity-90'
                : 'bg-(--color-primary) text-(--color-on-primary) hover:opacity-90'
            }`}
            onClick={handleOk}
            disabled={loading}
          >
            {config.okText || 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfirmConfig | null>(null)

  const showConfirm = useCallback((cfg: ConfirmConfig) => {
    setConfig(cfg)
  }, [])

  // Register global singleton
  showConfirmFn = showConfirm

  return (
    <>
      {children}
      {config &&
        createPortal(
          <ConfirmDialogView config={config} onClose={() => setConfig(null)} />,
          document.body,
        )}
    </>
  )
}
