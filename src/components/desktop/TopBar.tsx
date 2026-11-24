import { Kbd, Tooltip } from 'devnonla-ui'
import { Search, Upload } from '@/components/ui/icons'
import AppLogo from '../ui/AppLogo'

interface TopBarProps {
  onSearch: () => void
  onImport: () => void
}

/**
 * Replaces the window title bar: the macOS traffic lights float over its left
 * edge (TitleBarStyle::Overlay, see src-tauri/src/shell.rs), the empty parts drag
 * the window.
 */
export function TopBar({ onSearch, onImport }: TopBarProps) {
  return (
    <header
      data-tauri-drag-region
      className="absolute inset-x-0 top-0 z-40 h-11 flex items-center gap-3 pl-21 pr-3 bg-white/55 backdrop-blur-xl border-b border-black/6 select-none"
    >
      <div data-tauri-drag-region className="flex items-center gap-2 min-w-0">
        <AppLogo size={18} />
        <span data-tauri-drag-region className="text-[13px] font-semibold text-(--color-ink)">
          Nonla Desk
        </span>
      </div>

      <div data-tauri-drag-region className="flex-1 self-stretch" />

      <button
        type="button"
        onClick={onSearch}
        aria-label="Search apps"
        className="h-7 w-56 flex items-center gap-2 px-2.5 rounded-md border border-black/8 bg-white/70 text-[12px] text-(--color-mute) cursor-pointer transition-colors hover:bg-white hover:text-(--color-body) focus-visible:outline-2 focus-visible:outline-(--color-primary)"
      >
        <Search size={14} aria-hidden />
        <span className="flex-1 text-left">Search apps…</span>
        <Kbd keys={['⌘', 'K']} />
      </button>

      <Tooltip title="Import a mini app (.zip)">
        <button
          type="button"
          onClick={onImport}
          aria-label="Import a mini app"
          className="h-7 w-7 flex items-center justify-center rounded-md text-(--color-body) cursor-pointer transition-colors hover:bg-black/5 hover:text-(--color-ink) focus-visible:outline-2 focus-visible:outline-(--color-primary)"
        >
          <Upload size={15} aria-hidden />
        </button>
      </Tooltip>
    </header>
  )
}
