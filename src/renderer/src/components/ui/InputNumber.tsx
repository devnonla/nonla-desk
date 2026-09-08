interface InputNumberProps {
  value?: number | string
  onChange?: (value: number | null) => void
  placeholder?: string
  size?: 'small' | 'middle' | 'large'
  className?: string
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}

export function InputNumber({
  value,
  onChange,
  placeholder,
  size = 'middle',
  className = '',
  min,
  max,
  step,
  disabled,
}: InputNumberProps) {
  const sizeClasses: Record<string, string> = {
    small: 'h-7 px-2.5 text-[12px]',
    middle: 'h-9 px-3 text-sm',
    large: 'h-10 px-3.5 text-sm',
  }

  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => {
        const val = e.target.value
        onChange?.(val === '' ? null : Number(val))
      }}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={`w-full bg-(--color-canvas) text-(--color-ink) border border-(--color-hairline) rounded-sm outline-none transition-colors placeholder:text-(--color-mute) focus:border-(--color-primary) disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${sizeClasses[size]} ${className}`}
    />
  )
}
