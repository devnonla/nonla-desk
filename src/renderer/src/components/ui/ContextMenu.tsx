import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type ContextMenuItem =
  | { type: 'separator'; key: string }
  | {
      type?: 'item'
      key: string
      label: string
      icon?: ReactNode
      danger?: boolean
      onSelect: () => void
    }

interface ContextMenuProps {
  open: boolean
  x: number
  y: number
  items: ContextMenuItem[]
  label?: string
  onClose: () => void
}

const MENU_MIN_WIDTH = 176
const VIEWPORT_PAD = 8

function clampPosition(x: number, y: number, width: number, height: number) {
  const maxX = window.innerWidth - width - VIEWPORT_PAD
  const maxY = window.innerHeight - height - VIEWPORT_PAD
  return {
    left: Math.max(VIEWPORT_PAD, Math.min(x, maxX)),
    top: Math.max(VIEWPORT_PAD, Math.min(y, maxY)),
  }
}

export function ContextMenu({ open, x, y, items, label, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    if (!open) return
    const el = menuRef.current
    if (!el) {
      setPos(clampPosition(x, y, MENU_MIN_WIDTH, 220))
      return
    }
    setPos(clampPosition(x, y, el.offsetWidth, el.offsetHeight))
  }, [open, x, y])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-80"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label={label}
        style={{ top: pos.top, left: pos.left, minWidth: MENU_MIN_WIDTH }}
        className="fixed z-81 py-1 rounded-sm border border-(--color-hairline) bg-(--color-canvas-soft) shadow-[0_16px_48px_rgba(29,29,29,0.12),0_0_0_1px_rgba(29,29,29,0.06)]"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((item) => {
          if (item.type === 'separator') {
            return (
              <div key={item.key} aria-hidden="true" className="h-px my-1 bg-(--color-hairline)" />
            )
          }
          return (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => {
                onClose()
                item.onSelect()
              }}
              className={`flex w-full items-center gap-2 px-2.5 h-8 text-left text-[12px] font-medium leading-4 border-none cursor-pointer bg-transparent ${
                item.danger
                  ? 'text-(--color-error) hover:bg-(--color-error)/10'
                  : 'text-(--color-ink) hover:bg-(--color-canvas)'
              }`}
            >
              <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0 opacity-80">
                {item.icon}
              </span>
              {item.label}
            </button>
          )
        })}
      </div>
    </>,
    document.body,
  )
}
