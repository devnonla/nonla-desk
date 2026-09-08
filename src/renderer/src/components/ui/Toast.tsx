import { AlertCircle, CheckCircle, Info, X, XCircle } from 'lucide-react'
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// ─── Types ───────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: string
  type: ToastType
  message: string
}

interface ToastContextType {
  success: (msg: string) => void
  error: (msg: string) => void
  warning: (msg: string) => void
  info: (msg: string) => void
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextType | null>(null)

// ─── Singleton (imperative API) ──────────────────────────────────────────────

let globalToast: ToastContextType | null = null

export const toast: ToastContextType = {
  success: (msg: string) => globalToast?.success(msg),
  error: (msg: string) => globalToast?.error(msg),
  warning: (msg: string) => globalToast?.warning(msg),
  info: (msg: string) => globalToast?.info(msg),
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be inside ToastProvider')
  return ctx
}

// ─── Icons & Colors ──────────────────────────────────────────────────────────

const TOAST_CONFIG: Record<
  ToastType,
  { icon: ReactNode; borderColor: string; bgColor: string; textColor: string }
> = {
  success: {
    icon: <CheckCircle size={14} />,
    borderColor: 'border-(--color-primary)/30',
    bgColor: 'bg-(--color-primary)/10',
    textColor: 'text-(--color-primary)',
  },
  error: {
    icon: <XCircle size={14} />,
    borderColor: 'border-(--color-error)/30',
    bgColor: 'bg-(--color-error)/10',
    textColor: 'text-(--color-error)',
  },
  warning: {
    icon: <AlertCircle size={14} />,
    borderColor: 'border-(--color-warning)/30',
    bgColor: 'bg-(--color-warning)/10',
    textColor: 'text-(--color-warning)',
  },
  info: {
    icon: <Info size={14} />,
    borderColor: 'border-blue-500/30',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-400',
  },
}

// ─── Toast Item ──────────────────────────────────────────────────────────────

function ToastItemView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const config = TOAST_CONFIG[item.type]

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2.5 rounded-md border ${config.borderColor} ${config.bgColor} backdrop-blur-md shadow-lg max-w-sm animate-[toast-in_200ms_ease-out]`}
    >
      <span className={`shrink-0 ${config.textColor}`}>{config.icon}</span>
      <span className="text-[12px] text-(--color-ink) font-medium flex-1">{item.message}</span>
      <button
        type="button"
        className="shrink-0 w-4 h-4 flex items-center justify-center bg-transparent border-none cursor-pointer text-(--color-mute) hover:text-(--color-ink) transition-colors"
        onClick={() => onDismiss(item.id)}
      >
        <X size={10} />
      </button>
    </div>
  )
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counterRef = useRef(0)

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = `toast-${++counterRef.current}`
    setToasts((prev) => [...prev.slice(-4), { id, type, message }]) // keep max 5
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const contextValue: ToastContextType = {
    success: (msg) => addToast('success', msg),
    error: (msg) => addToast('error', msg),
    warning: (msg) => addToast('warning', msg),
    info: (msg) => addToast('info', msg),
  }

  // Register global singleton
  globalToast = contextValue

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {createPortal(
        <div className="fixed top-3 right-3 z-9999 flex flex-col gap-2 pointer-events-auto">
          {toasts.map((t) => (
            <ToastItemView key={t.id} item={t} onDismiss={dismiss} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}
