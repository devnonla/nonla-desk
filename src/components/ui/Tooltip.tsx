import { type ReactNode, useEffect, useRef, useState } from 'react'
import { FloatingPortal, type Placement } from './FloatingLayer'

interface TooltipProps {
  title?: ReactNode
  children: ReactNode
  placement?: Placement
}

export function Tooltip({ title, children, placement = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  if (!title) return <>{children}</>

  const show = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setVisible(true)
  }

  const hide = () => {
    timeoutRef.current = setTimeout(() => setVisible(false), 100)
  }

  return (
    <>
      <div ref={anchorRef} className="inline-flex" onMouseEnter={show} onMouseLeave={hide}>
        {children}
      </div>
      <FloatingPortal
        open={visible}
        anchorRef={anchorRef}
        placement={placement}
        interactive={false}
        role="tooltip"
        className="px-2 py-1 text-[11px] font-medium text-(--color-ink) bg-(--color-canvas-soft) border border-(--color-hairline) rounded-sm shadow-lg whitespace-nowrap"
      >
        {title}
      </FloatingPortal>
    </>
  )
}
