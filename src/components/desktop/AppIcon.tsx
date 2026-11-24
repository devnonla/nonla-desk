import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { parseSvgIcon, prepareSvgIcon } from '@/lib/svg-icon'

export const ICON_CATALOG = [
  { name: 'Box', emoji: '📦' },
  { name: 'Activity', emoji: '📊' },
  { name: 'Zap', emoji: '⚡' },
  { name: 'Sparkles', emoji: '✨' },
  { name: 'Code', emoji: '💻' },
  { name: 'Database', emoji: '🗄️' },
  { name: 'Globe', emoji: '🌍' },
  { name: 'Settings', emoji: '⚙️' },
  { name: 'Terminal', emoji: '🖥️' },
  { name: 'FileJson', emoji: '📄' },
  { name: 'Palette', emoji: '🎨' },
  { name: 'Calculator', emoji: '🧮' },
  { name: 'Clock', emoji: '🕐' },
  { name: 'Search', emoji: '🔍' },
  { name: 'Shield', emoji: '🛡️' },
  { name: 'Wifi', emoji: '📶' },
  { name: 'BarChart', emoji: '📈' },
  { name: 'Bookmark', emoji: '🔖' },
  { name: 'Briefcase', emoji: '💼' },
  { name: 'Cloud', emoji: '☁️' },
  { name: 'Cpu', emoji: '🧠' },
  { name: 'Hash', emoji: '#️⃣' },
  { name: 'Key', emoji: '🔑' },
  { name: 'Layers', emoji: '📚' },
  { name: 'Link', emoji: '🔗' },
  { name: 'Lock', emoji: '🔒' },
  { name: 'Mail', emoji: '✉️' },
  { name: 'Monitor', emoji: '🖥️' },
  { name: 'Package', emoji: '📦' },
  { name: 'Server', emoji: '🖥️' },
  { name: 'Smartphone', emoji: '📱' },
  { name: 'Tool', emoji: '🔧' },
  { name: 'StickyNote', emoji: '📝' },
  { name: 'Plus', emoji: '➕' },
  { name: 'Robot', emoji: '🤖' },
] as const

const ALIASES: Record<string, string> = {
  Gear: '⚙️',
  Bot: '🤖',
  Agent: '🤖',
  Sparkle: '✨',
  Upload: '📤',
  UploadSimple: '📤',
  Download: '📥',
  DownloadSimple: '📥',
  MagnifyingGlass: '🔍',
  Pencil: '✏️',
  PencilSimple: '✏️',
  Wrench: '🔧',
}

const NAME_TO_EMOJI: Record<string, string> = {
  ...Object.fromEntries(ICON_CATALOG.map((item) => [item.name, item.emoji])),
  ...ALIASES,
}

function isEmoji(value: string) {
  return /\p{Extended_Pictographic}/u.test(value)
}

export function iconToEmoji(name: string): string {
  if (NAME_TO_EMOJI[name]) return NAME_TO_EMOJI[name]
  if (isEmoji(name)) return name
  return '📦'
}

function emojiToUnicode(emoji: string) {
  return [...emoji]
    .map((char) => char.codePointAt(0)?.toString(16))
    .filter(Boolean)
    .join('-')
}

function fluentEmojiUrl(emoji: string) {
  return `https://unpkg.com/@lobehub/fluent-emoji-3d@latest/assets/${emojiToUnicode(emoji)}.webp`
}

interface AppIconProps {
  name: string
  /** Inline SVG from the app's icon.svg. Wins over `name` when it can be drawn. */
  svg?: string | null
  size?: number
  className?: string
}

function SvgIcon({
  svg,
  size,
  className,
  onFail,
}: {
  svg: SVGSVGElement
  size: number
  className: string
  onFail: () => void
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const idPrefix = `ai${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  useLayoutEffect(() => {
    const host = ref.current
    if (!host) return
    try {
      const node = prepareSvgIcon(svg, idPrefix)
      host.replaceChildren(node)
      const box = node.getBBox()
      if (!box.width && !box.height) onFail()
    } catch {
      onFail()
    }
    return () => host.replaceChildren()
  }, [svg, idPrefix, onFail])

  return (
    <span
      ref={ref}
      aria-hidden
      className={`flex shrink-0 overflow-hidden text-(--color-ink) ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

export function AppIcon({ name, svg, size = 18, className = '' }: AppIconProps) {
  const parsed = useMemo(() => parseSvgIcon(svg), [svg])
  const [svgFailed, setSvgFailed] = useState(false)
  const onFail = useMemo(() => () => setSvgFailed(true), [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the icon changes
  useLayoutEffect(() => setSvgFailed(false), [svg])

  if (parsed && !svgFailed) {
    return <SvgIcon svg={parsed} size={size} className={className} onFail={onFail} />
  }
  return <NamedIcon name={name} size={size} className={className} />
}

function NamedIcon({ name, size, className }: { name: string; size: number; className: string }) {
  const emoji = iconToEmoji(name)
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span
        aria-hidden
        className={`inline-flex items-center justify-center leading-none select-none ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.88 }}
      >
        {emoji}
      </span>
    )
  }

  return (
    <img
      src={fluentEmojiUrl(emoji)}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={`shrink-0 select-none pointer-events-none ${className}`}
      onError={() => setFailed(true)}
    />
  )
}
