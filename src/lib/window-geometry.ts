/**
 * Where each desktop window was left (position, size, zoomed), keyed by the
 * window key (`app:<id>`, `info:<id>`). Kept in the webview's localStorage, which
 * Tauri persists with the app's data, so windows reopen where they were.
 */

export interface WindowGeometry {
  x: number
  y: number
  w: number
  h: number
  expanded: boolean
}

const PREFIX = 'nonla.window.'

export function loadGeometry(key: string): WindowGeometry | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const g = JSON.parse(raw) as Partial<WindowGeometry>
    if ([g.x, g.y, g.w, g.h].some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null
    return { x: g.x!, y: g.y!, w: g.w!, h: g.h!, expanded: Boolean(g.expanded) }
  } catch {
    return null
  }
}

export function saveGeometry(key: string, geometry: WindowGeometry) {
  try {
    const rounded = {
      x: Math.round(geometry.x),
      y: Math.round(geometry.y),
      w: Math.round(geometry.w),
      h: Math.round(geometry.h),
      expanded: geometry.expanded,
    }
    localStorage.setItem(PREFIX + key, JSON.stringify(rounded))
  } catch {
    // Storage can be unavailable; the window just opens at its default spot.
  }
}

export function forgetGeometry(key: string) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    // ignore
  }
}
