import { useState } from 'react'

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
  size?: number
  className?: string
}

export function AppIcon({ name, size = 18, className = '' }: AppIconProps) {
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
