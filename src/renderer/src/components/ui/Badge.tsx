import type { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}

export function Badge({ children, className = '', style }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0 text-[10px] font-medium leading-tight rounded-xs border border-(--color-hairline) bg-(--color-canvas-soft) text-(--color-mute) ${className}`}
      style={style}
    >
      {children}
    </span>
  )
}
