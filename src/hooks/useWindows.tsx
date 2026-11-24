import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { loadGeometry } from '@/lib/window-geometry'

/** What a desktop window shows: a running mini app, or its read-only details. */
export type WindowKind = 'app' | 'info'

export interface DeskWindow {
  key: string
  kind: WindowKind
  appId?: string
  /** Stacking order; the highest is the focused window. */
  z: number
  expanded: boolean
  /** Cascade position, so new windows don't land exactly on top of each other. */
  slot: number
}

interface WindowsApi {
  windows: DeskWindow[]
  focused: DeskWindow | null
  open: (kind: WindowKind, appId?: string) => void
  close: (key: string) => void
  closeApp: (appId: string) => void
  focus: (key: string) => void
  toggleExpand: (key: string) => void
}

const WindowsContext = createContext<WindowsApi | null>(null)

const windowKey = (kind: WindowKind, appId?: string) => `${kind}:${appId}`

/** Move one window to the top of the stack. */
function raise(list: DeskWindow[], key: string) {
  const top = Math.max(0, ...list.map((w) => w.z))
  return list.map((w) => (w.key === key && w.z !== top ? { ...w, z: top + 1 } : w))
}

/** Several windows open at once, like a desktop: open, focus (raise), close. */
export function WindowsProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<DeskWindow[]>([])

  const open = useCallback((kind: WindowKind, appId?: string) => {
    const key = windowKey(kind, appId)
    setWindows((list) => {
      if (list.some((w) => w.key === key)) return raise(list, key)
      const top = Math.max(0, ...list.map((w) => w.z))
      const used = new Set(list.map((w) => w.slot))
      let slot = 0
      while (used.has(slot)) slot++
      const expanded = loadGeometry(key)?.expanded ?? false
      return [...list, { key, kind, appId, z: top + 1, expanded, slot }]
    })
  }, [])

  const close = useCallback((key: string) => {
    setWindows((list) => list.filter((w) => w.key !== key))
  }, [])

  const closeApp = useCallback((appId: string) => {
    setWindows((list) => list.filter((w) => w.appId !== appId))
  }, [])

  const focus = useCallback((key: string) => {
    setWindows((list) => raise(list, key))
  }, [])

  const toggleExpand = useCallback((key: string) => {
    setWindows((list) => list.map((w) => (w.key === key ? { ...w, expanded: !w.expanded } : w)))
  }, [])

  const value = useMemo<WindowsApi>(() => {
    const focused = windows.reduce<DeskWindow | null>((a, w) => (!a || w.z > a.z ? w : a), null)
    return { windows, focused, open, close, closeApp, focus, toggleExpand }
  }, [windows, open, close, closeApp, focus, toggleExpand])

  return <WindowsContext.Provider value={value}>{children}</WindowsContext.Provider>
}

export function useWindows() {
  const ctx = useContext(WindowsContext)
  if (!ctx) throw new Error('useWindows must be used inside WindowsProvider')
  return ctx
}
