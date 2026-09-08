import { Maximize2, Minimize2, X } from 'lucide-react'
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Tooltip } from '../ui/Tooltip'
import { AppIcon } from './AppIcon'

interface DesktopWindowProps {
  title?: string
  icon?: string
  expanded: boolean
  onClose: () => void
  onToggleExpand: () => void
  children: ReactNode
}

type Phase = 'entering' | 'open' | 'leaving'

type Size = { w: number; h: number }
type Point = { x: number; y: number }

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return Boolean(target.closest('.monaco-editor'))
}

function originFromActiveIcon(overlay: HTMLElement, frame: HTMLElement) {
  const source = document.querySelector('[aria-current="true"]')
  if (!(source instanceof HTMLElement)) return '50% 50%'

  const icon = source.getBoundingClientRect()
  const overlayBox = overlay.getBoundingClientRect()
  const x = icon.left + icon.width / 2 - overlayBox.left - frame.offsetLeft
  const y = icon.top + icon.height / 2 - overlayBox.top - frame.offsetTop
  return `${x}px ${y}px`
}

function compactSize(view: Size): Size {
  return {
    w: Math.min(window.innerWidth * 0.8, view.w),
    h: Math.max(0, view.h - 80),
  }
}

function clampOffset(view: Size, compact: Size, next: Point) {
  const maxX = Math.max(0, (view.w - compact.w) / 2)
  const maxY = Math.max(0, (view.h - compact.h) / 2)
  return {
    x: Math.min(maxX, Math.max(-maxX, next.x)),
    y: Math.min(maxY, Math.max(-maxY, next.y)),
  }
}

function collapsedRect(view: Size, offset: Point) {
  const compact = compactSize(view)
  const clamped = clampOffset(view, compact, offset)
  return {
    x: (view.w - compact.w) / 2 + clamped.x,
    y: (view.h - compact.h) / 2 + clamped.y,
    w: compact.w,
    h: compact.h,
  }
}

function WindowControl({
  label,
  onClick,
  shortcut,
  children,
}: {
  label: string
  onClick: () => void
  shortcut?: string
  children: ReactNode
}) {
  return (
    <Tooltip
      title={
        shortcut ? (
          <span className="inline-flex items-center gap-2">
            {label}
            <kbd className="font-mono text-[10px] text-(--color-mute)">{shortcut}</kbd>
          </span>
        ) : (
          label
        )
      }
      placement="bottom"
    >
      <button
        type="button"
        aria-label={label}
        aria-keyshortcuts={shortcut}
        onClick={onClick}
        className="inline-flex items-center justify-center w-6 h-6 rounded-sm border-none bg-transparent text-(--color-mute) cursor-pointer shrink-0 hover:bg-(--color-bg-hover) hover:text-(--color-ink) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-primary)"
      >
        {children}
      </button>
    </Tooltip>
  )
}

export function DesktopWindow({
  title,
  icon,
  expanded,
  onClose,
  onToggleExpand,
  children,
}: DesktopWindowProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLElement>(null)
  const closedRef = useRef(false)
  const expandedRef = useRef(expanded)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)
  const [phase, setPhase] = useState<Phase>(() => (prefersReducedMotion() ? 'open' : 'entering'))
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [view, setView] = useState<Size>(() => ({
    w: window.innerWidth,
    h: Math.max(0, window.innerHeight - 38),
  }))
  const requestCloseRef = useRef<() => void>(() => {})
  expandedRef.current = expanded

  useLayoutEffect(() => {
    const overlay = overlayRef.current
    const frame = frameRef.current
    if (!overlay || !frame) return

    frame.style.transformOrigin = originFromActiveIcon(overlay, frame)

    if (prefersReducedMotion()) {
      setPhase('open')
      return
    }

    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setPhase('open'))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
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
    }, 280)
    return () => clearTimeout(t)
  }, [phase, onClose])

  useLayoutEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return

    const sync = () => {
      const next = { w: overlay.clientWidth, h: overlay.clientHeight }
      setView(next)
      if (expandedRef.current) return
      setOffset((current) => clampOffset(next, compactSize(next), current))
    }

    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(overlay)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isEditableTarget(e.target)) return
      e.preventDefault()
      requestCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const startDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (expanded || phase === 'leaving') return
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic or already-captured pointers can throw; drag still works via move/up.
    }
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    }
    setDragging(true)
  }

  const onDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    setOffset(
      clampOffset(view, compactSize(view), {
        x: drag.origX + e.clientX - drag.startX,
        y: drag.origY + e.clientY - drag.startY,
      }),
    )
  }

  const endDrag = (e: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const visible = phase === 'open'
  const leaving = phase === 'leaving'
  const rect = expanded ? { x: 0, y: 0, w: view.w, h: view.h } : collapsedRect(view, offset)
  const reduce = prefersReducedMotion()
  const duration = reduce ? '150ms' : '300ms'
  const geom =
    !dragging && phase === 'open' && !reduce
      ? `top ${duration} ${EASE}, left ${duration} ${EASE}, width ${duration} ${EASE}, height ${duration} ${EASE}, border-radius ${duration} ${EASE}, `
      : ''

  return (
    <div ref={overlayRef} className="absolute inset-0 z-30 pointer-events-none">
      <section
        ref={frameRef}
        aria-label={title || 'Window'}
        onTransitionEnd={(e) => {
          if (e.target !== e.currentTarget) return
          if (phase !== 'leaving') return
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
          transition: `${geom}opacity ${duration} ${EASE}, transform ${duration} ${EASE}`,
        }}
        className={`absolute flex flex-col overflow-hidden pointer-events-auto bg-(--color-canvas-soft) border border-(--color-hairline) shadow-[0_16px_48px_rgba(29,29,29,0.12),0_0_0_1px_rgba(29,29,29,0.06)] motion-reduce:scale-100 motion-reduce:opacity-100 ${
          expanded ? 'rounded-none' : 'rounded-md'
        } ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.18]'} ${
          leaving ? 'pointer-events-none' : ''
        }`}
      >
        <header
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`flex items-center gap-2 h-8 pl-3 pr-1 shrink-0 select-none bg-(--color-canvas) border-b border-(--color-hairline) touch-none ${
            expanded ? '' : dragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          {icon ? (
            <span className="shrink-0 inline-flex items-center justify-center w-4 h-4" aria-hidden>
              <AppIcon name={icon} size={16} />
            </span>
          ) : null}
          {title ? (
            <h2 className="flex-1 min-w-0 m-0 text-[13px] font-semibold text-(--color-ink) truncate">
              {title}
            </h2>
          ) : (
            <>
              <span className="sr-only">Window</span>
              <span className="flex-1" />
            </>
          )}

          <div className="flex items-center gap-0.5 shrink-0">
            <WindowControl
              label={expanded ? 'Restore window' : 'Expand window'}
              onClick={onToggleExpand}
              shortcut="Shift + ↑"
            >
              {expanded ? (
                <Minimize2 size={14} strokeWidth={2} />
              ) : (
                <Maximize2 size={14} strokeWidth={2} />
              )}
            </WindowControl>
            <WindowControl label="Close window" onClick={requestClose} shortcut="Esc">
              <X size={15} strokeWidth={2} />
            </WindowControl>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      </section>
    </div>
  )
}
