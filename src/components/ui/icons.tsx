/**
 * Icons for the Nonla Desk UI. devnonla-ui's `Icon` where it has the glyph,
 * otherwise a small inline SVG in the same 24px, round-cap stroke style.
 */
import { Icon, type IconName } from 'devnonla-ui'
import type { ReactNode } from 'react'

export interface GlyphProps {
  size?: number
  strokeWidth?: number
  className?: string
}

function fromKit(name: IconName) {
  return function KitIcon({ size = 16, strokeWidth, className }: GlyphProps) {
    return <Icon name={name} size={size} stroke={strokeWidth} className={className} />
  }
}

function drawn(children: ReactNode) {
  return function DrawnIcon({ size = 16, strokeWidth = 2, className }: GlyphProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`shrink-0 ${className ?? ''}`}
        aria-hidden="true"
      >
        {children}
      </svg>
    )
  }
}

export const Search = fromKit('search')
export const X = fromKit('close')
export const Trash2 = fromKit('trash')
export const Eye = fromKit('eye')
export const Code = fromKit('code')
export const Download = fromKit('download')
export const Pencil = fromKit('pen')
export const AppWindow = fromKit('window')
export const ArrowLeft = fromKit('arrow-left')
export const AlertCircle = fromKit('error')

export const ChevronDown = drawn(<path d="m6 9 6 6 6-6" />)
export const ChevronLeft = drawn(<path d="m15 6-6 6 6 6" />)
export const Upload = drawn(
  <>
    <path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5" />
    <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
  </>,
)
export const ExternalLink = drawn(
  <>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </>,
)
export const Power = drawn(
  <>
    <path d="M12 3v8" />
    <path d="M7 6.3a7.5 7.5 0 1 0 10 0" />
  </>,
)
export const Save = drawn(
  <>
    <path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
    <path d="M8 4v5h7V4M8 20v-6h8v6" />
  </>,
)
export const Settings = drawn(
  <>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </>,
)
export const Terminal = drawn(
  <>
    <path d="m5 8 4 4-4 4" />
    <path d="M12 17h7" />
  </>,
)
export const LayoutGrid = drawn(
  <>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </>,
)
export const AlertTriangle = drawn(
  <>
    <path d="M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4M12 17h.01" />
  </>,
)
export const Box = drawn(
  <>
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
  </>,
)
export const ShieldOff = drawn(
  <>
    <path d="M19.5 13.5c.3-1 .5-2 .5-3V5l-8-3-3.2 1.2M5 5v5.5c0 5 3.5 8.5 7 10.5a15 15 0 0 0 4.4-3.6" />
    <path d="m3 3 18 18" />
  </>,
)
/** Spinner: add `animate-spin` where it is used. */
export const Loader2 = drawn(<path d="M21 12a9 9 0 1 1-6.2-8.6" />)
