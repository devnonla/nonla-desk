import { ChevronDown, Search, X } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { FloatingPortal } from './FloatingLayer'

interface SelectOption {
  value: string
  label: ReactNode
}

interface SelectProps {
  value?: string
  onChange?: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  size?: 'small' | 'middle' | 'large'
  className?: string
  popupClassName?: string
  showSearch?: boolean
  filterOption?: (input: string, option?: SelectOption) => boolean
  disabled?: boolean
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  size = 'middle',
  className = '',
  showSearch = false,
  filterOption,
  disabled = false,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const sizeClasses: Record<string, string> = {
    small: 'h-7 text-[12px]',
    middle: 'h-9 text-sm',
    large: 'h-10 text-sm',
  }

  const close = useCallback(() => {
    setOpen(false)
    setSearch('')
  }, [])

  // Focus search input when open; Escape closes the menu before the window
  useEffect(() => {
    if (!open) return
    if (showSearch) {
      setTimeout(() => searchInputRef.current?.focus(), 0)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, showSearch, close])

  const selectedOption = options.find((o) => o.value === value)

  const filteredOptions = search
    ? options.filter((o) => {
        if (filterOption) return filterOption(search, o)
        const label = typeof o.label === 'string' ? o.label : String(o.value)
        return label.toLowerCase().includes(search.toLowerCase())
      })
    : options

  const handleSelect = useCallback(
    (val: string) => {
      onChange?.(val)
      setOpen(false)
      setSearch('')
    },
    [onChange],
  )

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setSearch('')
      } else if (e.key === 'Enter' && filteredOptions.length > 0) {
        handleSelect(filteredOptions[0].value)
      }
    },
    [filteredOptions, handleSelect],
  )

  return (
    <div ref={containerRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen(!open)
        }}
        className={`w-full flex items-center justify-between gap-2 px-3 bg-(--color-canvas) text-(--color-ink) border border-(--color-hairline) rounded-sm cursor-pointer transition-colors outline-none disabled:opacity-50 disabled:cursor-not-allowed hover:border-(--color-border-hover) ${
          open ? 'border-(--color-primary)' : ''
        } ${sizeClasses[size]}`}
      >
        <span
          className={`truncate text-left ${selectedOption ? 'text-(--color-ink)' : 'text-(--color-mute)'}`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={12}
          className={`shrink-0 text-(--color-mute) transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <FloatingPortal
        open={open}
        anchorRef={containerRef}
        placement="bottom"
        align="start"
        matchWidth
        onDismiss={close}
        className="min-w-40 bg-(--color-canvas-soft) border border-(--color-hairline) rounded-md shadow-lg overflow-hidden"
      >
        {showSearch && (
          <div className="relative p-1.5 border-b border-(--color-hairline)">
            <Search
              size={12}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-(--color-mute)"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              onKeyDown={handleKeyDown}
              className="w-full h-7 pl-7 pr-7 text-[12px] bg-(--color-canvas) text-(--color-ink) border border-(--color-hairline) rounded-sm outline-none placeholder:text-(--color-mute) focus:border-(--color-primary)"
            />
            {search && (
              <button
                type="button"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-(--color-mute) hover:text-(--color-ink)"
                onClick={() => setSearch('')}
              >
                <X size={11} />
              </button>
            )}
          </div>
        )}

        <div className="max-h-52 overflow-y-auto py-1">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-3 text-center text-[11px] text-(--color-mute)">No results</div>
          ) : (
            filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`w-full text-left px-3 py-1.5 text-[12px] cursor-pointer transition-colors border-none ${
                  option.value === value
                    ? 'bg-(--color-primary)/10 text-(--color-primary)'
                    : 'bg-transparent text-(--color-body) hover:bg-(--color-bg-hover) hover:text-(--color-ink)'
                }`}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      </FloatingPortal>
    </div>
  )
}
