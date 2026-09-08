import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

interface ButtonProps {
  children: ReactNode
  type?: 'primary' | 'default' | 'ghost'
  size?: 'small' | 'middle' | 'large'
  icon?: ReactNode
  loading?: boolean
  disabled?: boolean
  danger?: boolean
  className?: string
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
}

export function Button({
  children,
  type = 'default',
  size = 'middle',
  icon,
  loading = false,
  disabled = false,
  danger = false,
  className = '',
  onClick,
}: ButtonProps) {
  const sizeClasses: Record<string, string> = {
    small: 'h-7 px-3 text-[12px] gap-1',
    middle: 'h-8 px-4 text-[13px] gap-1.5',
    large: 'h-10 px-5 text-sm gap-2',
  }

  const variantClasses: Record<string, string> = {
    primary: danger
      ? 'bg-(--color-error) text-white border-transparent hover:opacity-90'
      : 'bg-(--color-primary) text-(--color-on-primary) border-transparent hover:opacity-90',
    default: danger
      ? 'bg-transparent text-(--color-error) border-(--color-error)/30 hover:bg-(--color-error)/10'
      : 'bg-transparent text-(--color-body) border-(--color-hairline) hover:bg-(--color-bg-hover) hover:text-(--color-ink) hover:border-(--color-border-hover)',
    ghost: danger
      ? 'bg-transparent text-(--color-error) border-transparent hover:bg-(--color-error)/10'
      : 'bg-transparent text-(--color-body) border-transparent hover:bg-(--color-bg-hover) hover:text-(--color-ink)',
  }

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={`inline-flex items-center justify-center font-semibold rounded-sm border cursor-pointer transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${sizeClasses[size]} ${variantClasses[type]} ${className}`}
    >
      {loading ? (
        <Loader2 size={13} className="animate-spin shrink-0" />
      ) : (
        icon && <span className="shrink-0 flex items-center">{icon}</span>
      )}
      {children}
    </button>
  )
}
