import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { loadGeometry, saveGeometry } from '@/lib/window-geometry'
import { AppIcon } from './AppIcon'

interface DesktopWindowProps {
  title?: string
  icon?: string
  iconSvg?: string | null
  expanded: boolean
  /** The top-most window: it takes Esc, has colored traffic lights and a stronger shadow. */
  focused: boolean
  /** Cascade position for a window opened for the first time (0, 1, 2…). */
  slot: number
  /** Remembers position, size and zoom under this key between openings. */
  persistKey: string
  /** Desktop icon the window grows from (`data-app-id`). */
  originId?: string
  onFocus: () => void
  onClose: () => void
  onToggleExpand: () => void
  children: ReactNode
}

type Phase = 'entering' | 'open' | 'leaving'
type Size = { w: number; h: number }
type Rect = { x: number; y: number; w: number; h: number }
/** Which edges a resize handle moves: n, s, e, w or a corner like "se". */
type Edges = string

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
/** Closing just fades the window out where it is. */
const CLOSE_TRANSITION = 'opacity 150ms cubic-bezier(0.4, 0, 1, 1)'
const MIN_W = 380
const MIN_H = 260
const TITLE_H = 36

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return false
}

/** Transform origin at the app's desktop icon, so the window grows out of it. */
function originFromIcon(overlay: HTMLElement, box: Rect, appId?: string) {
  const source = appId ? document.querySelector(`[data-app-id="${CSS.escape(appId)}"]`) : null
  if (!(source instanceof HTMLElement)) return '50% 50%'
  const icon = source.getBoundingClientRect()
  const overlayBox = overlay.getBoundingClientRect()
  const x = icon.left + icon.width / 2 - overlayBox.left - box.x
  const y = icon.top + icon.height / 2 - overlayBox.top - box.y
  return `${x}px ${y}px`
}

/** Keep the whole window inside the desktop area and at least the minimum size. */
function clampRect(view: Size, r: Rect): Rect {
  const w = Math.min(Math.max(r.w, Math.min(MIN_W, view.w)), view.w)
  const h = Math.min(Math.max(r.h, Math.min(MIN_H, view.h)), view.h)
  return {
    w,
    h,
    x: Math.min(Math.max(r.x, 0), Math.max(0, view.w - w)),
    y: Math.min(Math.max(r.y, 0), Math.max(0, view.h - h)),
  }
}

/** First position: centered, a cascade step down and right per open window. */
function initialRect(view: Size, slot: number): Rect {
  const w = Math.min(view.w * 0.72, 1100)
  const h = Math.min(view.h - 120, 820)
  const step = slot % 5
  return clampRect(view, {
    w,
    h,
    x: (view.w - w) / 2 + 20 + step * 30,
    y: (view.h - h) / 2 - 45 + step * 26,
  })
}

function resizeRect(start: Rect, edges: Edges, dx: number, dy: number): Rect {
  let { x, y, w, h } = start
  if (edges.includes('e')) w = start.w + dx
  if (edges.includes('s')) h = start.h + dy
  if (edges.includes('w')) {
    w = Math.max(MIN_W, start.w - dx)
    x = start.x + start.w - w
  }
  if (edges.includes('n')) {
    h = Math.max(MIN_H, start.h - dy)
    y = start.y + start.h - h
  }
  return { x, y, w, h }
}

const RESIZE_HANDLES: { edges: Edges; className: string }[] = [
  { edges: 'n', className: 'top-0 inset-x-3 h-1.5 -translate-y-1 cursor-ns-resize' },
  { edges: 's', className: 'bottom-0 inset-x-3 h-1.5 translate-y-1 cursor-ns-resize' },
  { edges: 'w', className: 'left-0 inset-y-3 w-1.5 -translate-x-1 cursor-ew-resize' },
  { edges: 'e', className: 'right-0 inset-y-3 w-1.5 translate-x-1 cursor-ew-resize' },
  { edges: 'nw', className: 'top-0 left-0 size-3 -translate-1 cursor-nwse-resize' },
  {
    edges: 'ne',
    className: 'top-0 right-0 size-3 translate-x-1 -translate-y-1 cursor-nesw-resize',
  },
  {
    edges: 'sw',
    className: 'bottom-0 left-0 size-3 -translate-x-1 translate-y-1 cursor-nesw-resize',
  },
  { edges: 'se', className: 'bottom-0 right-0 size-3 translate-1 cursor-nwse-resize' },
]

const LIGHT =
  'size-3.5 rounded-full border-none p-0 cursor-default flex items-center justify-center bg-linear-to-b transition-colors duration-100'
const GLYPH = 'size-2.5 opacity-0 group-hover/lights:opacity-100 transition-opacity duration-100'
const RED =
  'from-[#ff7a70] to-[#f2463d] shadow-[inset_0_0_0_0.5px_rgba(170,30,25,0.45)] text-[#7a1510]'
const GREEN =
  'from-[#4fdc68] to-[#1fb23a] shadow-[inset_0_0_0_0.5px_rgba(15,110,35,0.45)] text-[#0b5219]'
/** Gray dots of a window that is not focused; they take their color back on hover. */
const IDLE = 'from-[#dedcd8] to-[#cfcdc9] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.12)]'
const IDLE_RED = `${IDLE} text-[#7a1510] group-hover/lights:from-[#ff7a70] group-hover/lights:to-[#f2463d]`
const IDLE_GREEN = `${IDLE} text-[#0b5219] group-hover/lights:from-[#4fdc68] group-hover/lights:to-[#1fb23a]`

/** macOS-style close and zoom lights; gray when the window is not focused, glyphs on hover. */
function TrafficLights({
  focused,
  expanded,
  onClose,
  onToggleExpand,
}: {
  focused: boolean
  expanded: boolean
  onClose: () => void
  onToggleExpand: () => void
}) {
  return (
    <div className="group/lights flex items-center gap-2 pl-3.5 pr-2 h-full">
      <button
        type="button"
        aria-label="Close window"
        onClick={onClose}
        className={`${LIGHT} ${focused ? RED : IDLE_RED}`}
      >
        <svg viewBox="0 0 12 12" className={GLYPH} aria-hidden="true">
          <path
            d="M3.5 3.5l5 5M8.5 3.5l-5 5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <button
        type="button"
        aria-label={expanded ? 'Restore window' : 'Zoom window'}
        onClick={onToggleExpand}
        className={`${LIGHT} ${focused ? GREEN : IDLE_GREEN}`}
      >
        <svg viewBox="0 0 12 12" className={GLYPH} aria-hidden="true">
          {expanded ? (
            <path d="M6.5 2.2v3.3h3.3zM5.5 9.8V6.5H2.2z" fill="currentColor" />
          ) : (
            <path d="M3 9V4.4L7.6 9zM9 3v4.6L4.4 3z" fill="currentColor" />
          )}
        </svg>
      </button>
    </div>
  )
}

export function DesktopWindow({
  title,
  icon,
  iconSvg,
  expanded,
  focused,
  slot,
  persistKey,
  originId,
  onFocus,
  onClose,
  onToggleExpand,
  children,
}: DesktopWindowProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLElement>(null)
  const closedRef = useRef(false)
  const focusedRef = useRef(focused)
  focusedRef.current = focused
  const gestureRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    start: Rect
    edges: Edges | null
  } | null>(null)

  const [phase, setPhase] = useState<Phase>(() => (prefersReducedMotion() ? 'open' : 'entering'))
  const [gesture, setGesture] = useState<'move' | 'resize' | null>(null)
  const [view, setView] = useState<Size>(() => ({
    w: window.innerWidth,
    h: Math.max(0, window.innerHeight - 44),
  }))
  const [box, setBox] = useState<Rect>(() => {
    const saved = loadGeometry(persistKey)
    return saved ? clampRect(view, saved) : initialRect(view, slot)
  })
  const viewRef = useRef(view)
  viewRef.current = view
  const requestCloseRef = useRef<() => void>(() => {})

  // Remember where the window is, once a drag or resize has finished.
  useEffect(() => {
    if (!gesture) saveGeometry(persistKey, { ...box, expanded })
  }, [box, expanded, gesture, persistKey])

  // Open animation: grow from the desktop icon.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, on mount
  useLayoutEffect(() => {
    const overlay = overlayRef.current
    const frame = frameRef.current
    if (!overlay || !frame) return
    frame.style.transformOrigin = originFromIcon(overlay, box, originId)
    if (prefersReducedMotion()) {
      setPhase('open')
      return
    }
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setPhase('open'))
    })
    // WebKit pauses animation frames while the app window is hidden or covered;
    // don't leave a window stuck half-open when that happens.
    const fallback = window.setTimeout(() => setPhase('open'), 120)
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
      clearTimeout(fallback)
    }
  }, [])

  const requestClose = () => {
    if (closedRef.current || phase === 'leaving') return
    if (prefersReducedMotion()) {
      closedRef.current = true
      onClose()
      return
    }
    setPhase('leaving')
  }
  requestCloseRef.current = requestClose

  useEffect(() => {
    if (phase !== 'leaving') return
    const t = window.setTimeout(() => {
      if (closedRef.current) return
      closedRef.current = true
      onClose()
    }, 180)
    return () => clearTimeout(t)
  }, [phase, onClose])

  // Track the desktop area and keep the window inside it.
  useLayoutEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const sync = () => {
      const next = { w: overlay.clientWidth, h: overlay.clientHeight }
      setView(next)
      setBox((current) => clampRect(next, current))
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(overlay)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !focusedRef.current || isEditableTarget(e.target)) return
      e.preventDefault()
      requestCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const beginGesture = (e: ReactPointerEvent<HTMLElement>, edges: Edges | null) => {
    if (expanded || phase !== 'open' || e.button !== 0) return
    if (!edges && (e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    e.stopPropagation()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic or already-captured pointers can throw; the gesture still works.
    }
    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      start: box,
      edges,
    }
    setGesture(edges ? 'resize' : 'move')
  }

  const moveGesture = (e: ReactPointerEvent<HTMLElement>) => {
    const g = gestureRef.current
    if (!g || e.pointerId !== g.pointerId) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    const next = g.edges
      ? resizeRect(g.start, g.edges, dx, dy)
      : { ...g.start, x: g.start.x + dx, y: g.start.y + dy }
    setBox(clampRect(viewRef.current, next))
  }

  const endGesture = (e: ReactPointerEvent<HTMLElement>) => {
    if (!gestureRef.current || e.pointerId !== gestureRef.current.pointerId) return
    gestureRef.current = null
    setGesture(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const gestureHandlers = (edges: Edges | null) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => beginGesture(e, edges),
    onPointerMove: moveGesture,
    onPointerUp: endGesture,
    onPointerCancel: endGesture,
  })

  const shown = phase === 'open'
  const rect = expanded ? { x: 0, y: 0, ...view } : box
  const reduce = prefersReducedMotion()
  const duration = reduce ? '150ms' : '300ms'
  const geom =
    !gesture && phase === 'open' && !reduce
      ? `top ${duration} ${EASE}, left ${duration} ${EASE}, width ${duration} ${EASE}, height ${duration} ${EASE}, border-radius ${duration} ${EASE}, `
      : ''

  return (
    <div ref={overlayRef} className="absolute inset-0 pointer-events-none">
      <section
        ref={frameRef}
        aria-label={title || 'Window'}
        onPointerDownCapture={() => {
          if (!focusedRef.current) onFocus()
        }}
        onTransitionEnd={(e) => {
          if (e.target !== e.currentTarget || phase !== 'leaving') return
          if (e.propertyName !== 'opacity' && e.propertyName !== 'transform') return
          if (closedRef.current) return
          closedRef.current = true
          onClose()
        }}
        style={{
          top: rect.y,
          left: rect.x,
          width: rect.w,
          height: rect.h,
          transition:
            phase === 'leaving'
              ? CLOSE_TRANSITION
              : `${geom}opacity ${duration} ${EASE}, transform ${duration} ${EASE}, box-shadow 200ms ${EASE}`,
        }}
        className={`absolute flex flex-col pointer-events-auto bg-white/45 backdrop-blur-2xl backdrop-saturate-[1.8] motion-reduce:scale-100 ${
          expanded ? 'rounded-none' : 'rounded-xl'
        } ${
          focused
            ? 'shadow-[0_24px_64px_-12px_rgba(0,0,0,0.38),0_0_0_0.5px_rgba(0,0,0,0.18)]'
            : 'shadow-[0_12px_32px_-8px_rgba(0,0,0,0.2),0_0_0_0.5px_rgba(0,0,0,0.12)]'
        } ${shown ? 'opacity-100 scale-100' : phase === 'leaving' ? 'opacity-0 scale-100' : 'opacity-0 scale-[0.18]'} ${
          phase === 'leaving' ? 'pointer-events-none' : ''
        }`}
      >
        {/* Liquid glass: the frame is frosted glass over the wallpaper (blur, extra
            saturation); the title bar is that glass, the page below
            stays solid so apps read well. Traffic lights left, icon + title centered;
            drag to move, double-click to zoom. */}
        <header
          {...gestureHandlers(null)}
          onDoubleClick={(e) => {
            if (!(e.target as HTMLElement).closest('button')) onToggleExpand()
          }}
          style={{ height: TITLE_H }}
          className={`relative flex items-center shrink-0 select-none touch-none border-b ${
            expanded ? '' : 'rounded-t-xl'
          } ${focused ? 'bg-transparent border-black/8' : 'bg-white/20 border-black/5'}`}
        >
          <TrafficLights
            focused={focused}
            expanded={expanded}
            onClose={requestClose}
            onToggleExpand={onToggleExpand}
          />
          <div className="absolute inset-x-24 inset-y-0 flex items-center justify-center gap-1.5 pointer-events-none">
            {icon ? <AppIcon name={icon} svg={iconSvg} size={16} /> : null}
            <h2
              className={`m-0 truncate text-[13px] font-medium tracking-[-0.1px] ${
                focused ? 'text-neutral-800' : 'text-neutral-400'
              }`}
            >
              {title}
            </h2>
          </div>
        </header>

        <div
          className={`flex-1 min-h-0 overflow-hidden bg-(--color-canvas-soft) ${expanded ? '' : 'rounded-b-xl'} ${
            gesture ? 'pointer-events-none' : ''
          }`}
        >
          {children}
        </div>

        {!expanded
          ? RESIZE_HANDLES.map((h) => (
              <div
                key={h.edges}
                aria-hidden="true"
                {...gestureHandlers(h.edges)}
                className={`absolute z-10 touch-none ${h.className}`}
              />
            ))
          : null}
      </section>
    </div>
  )
}
