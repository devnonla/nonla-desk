import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

export type Placement = 'top' | 'bottom' | 'left' | 'right'
export type Align = 'start' | 'center' | 'end'

const VIEWPORT_PAD = 8

function placeFloating(
  trigger: DOMRect,
  size: { width: number; height: number },
  placement: Placement,
  align: Align,
  gap: number,
): { top: number; left: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight

  const space = {
    top: trigger.top - VIEWPORT_PAD,
    bottom: vh - trigger.bottom - VIEWPORT_PAD,
    left: trigger.left - VIEWPORT_PAD,
    right: vw - trigger.right - VIEWPORT_PAD,
  }

  let place = placement
  if (place === 'top' && size.height + gap > space.top && space.bottom > space.top) {
    place = 'bottom'
  } else if (place === 'bottom' && size.height + gap > space.bottom && space.top > space.bottom) {
    place = 'top'
  } else if (place === 'left' && size.width + gap > space.left && space.right > space.left) {
    place = 'right'
  } else if (place === 'right' && size.width + gap > space.right && space.left > space.right) {
    place = 'left'
  }

  let top = 0
  let left = 0

  if (place === 'top' || place === 'bottom') {
    top = place === 'top' ? trigger.top - size.height - gap : trigger.bottom + gap
    if (align === 'start') left = trigger.left
    else if (align === 'end') left = trigger.right - size.width
    else left = trigger.left + trigger.width / 2 - size.width / 2
  } else {
    left = place === 'left' ? trigger.left - size.width - gap : trigger.right + gap
    if (align === 'start') top = trigger.top
    else if (align === 'end') top = trigger.bottom - size.height
    else top = trigger.top + trigger.height / 2 - size.height / 2
  }

  left = Math.min(
    Math.max(VIEWPORT_PAD, left),
    Math.max(VIEWPORT_PAD, vw - size.width - VIEWPORT_PAD),
  )
  top = Math.min(
    Math.max(VIEWPORT_PAD, top),
    Math.max(VIEWPORT_PAD, vh - size.height - VIEWPORT_PAD),
  )

  return { top, left }
}

interface FloatingPortalProps {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  placement?: Placement
  align?: Align
  matchWidth?: boolean
  gap?: number
  interactive?: boolean
  className?: string
  style?: CSSProperties
  role?: string
  children?: ReactNode
  onDismiss?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export function FloatingPortal({
  open,
  anchorRef,
  placement = 'bottom',
  align = 'center',
  matchWidth = false,
  gap = 6,
  interactive = true,
  className = '',
  style,
  role,
  children,
  onDismiss,
  onMouseEnter,
  onMouseLeave,
}: FloatingPortalProps) {
  const floatingRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }

    const update = () => {
      const anchor = anchorRef.current
      const floating = floatingRef.current
      if (!anchor || !floating) return
      const trigger = anchor.getBoundingClientRect()
      if (matchWidth) {
        floating.style.width = `${Math.round(trigger.width)}px`
      }
      setCoords(
        placeFloating(
          trigger,
          { width: floating.offsetWidth, height: floating.offsetHeight },
          placement,
          align,
          gap,
        ),
      )
    }

    update()

    const floating = floatingRef.current
    const anchor = anchorRef.current
    const ro = new ResizeObserver(update)
    if (floating) ro.observe(floating)
    if (anchor) ro.observe(anchor)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef, placement, align, matchWidth, gap])

  useEffect(() => {
    if (!open || !onDismiss) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (anchorRef.current?.contains(target)) return
      if (floatingRef.current?.contains(target)) return
      onDismiss()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, onDismiss, anchorRef])

  if (!open) return null

  return createPortal(
    <div
      ref={floatingRef}
      role={role}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        top: coords?.top ?? 0,
        left: coords?.left ?? 0,
        visibility: coords ? 'visible' : 'hidden',
        ...style,
      }}
      className={`z-70 ${interactive ? '' : 'pointer-events-none'} ${className}`}
    >
      {children}
    </div>,
    document.body,
  )
}
