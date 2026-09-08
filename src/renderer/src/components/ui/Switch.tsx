interface SwitchProps {
  checked?: boolean
  onChange?: (checked: boolean) => void
  onClick?: (checked: boolean, e: React.MouseEvent) => void
  size?: 'small' | 'default'
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

export function Switch({
  checked = false,
  onChange,
  onClick,
  size = 'default',
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}: SwitchProps) {
  const isSmall = size === 'small'
  const trackW = isSmall ? 'w-7' : 'w-9'
  const trackH = isSmall ? 'h-4' : 'h-5'
  const thumbSize = isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'
  const thumbTranslate = checked
    ? isSmall
      ? 'translate-x-[13px]'
      : 'translate-x-[18px]'
    : 'translate-x-[3px]'

  return (
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked}
      disabled={disabled}
      className={`relative inline-flex items-center rounded-full border-none cursor-pointer transition-[background-color,transform] duration-200 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-(--color-primary) focus-visible:outline-offset-2 ${trackW} ${trackH} ${
        checked ? 'bg-(--color-primary)' : 'bg-(--color-hairline)'
      } ${className}`}
      onClick={(e) => {
        if (onClick) {
          onClick(!checked, e)
        } else {
          onChange?.(!checked)
        }
      }}
    >
      <span
        className={`block rounded-full shadow-sm transition-transform duration-200 ${thumbSize} ${thumbTranslate} ${checked ? 'bg-(--color-on-primary)' : 'bg-white'}`}
      />
    </button>
  )
}
