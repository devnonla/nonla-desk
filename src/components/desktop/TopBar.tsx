import { Kbd, Tooltip } from 'devnonla-ui'
import { useEffect, useState } from 'react'
import { Search, Upload } from '@/components/ui/icons'
import { api } from '@/lib/api'
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
  const [version, setVersion] = useState('')
  const [supported, setSupported] = useState(false)
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    void api.getUpdateInfo().then((info) => {
      setVersion(info.version)
      setSupported(info.supported)
      setPending(info.pending)
    })
    return api.onUpdatePending(setPending)
  }, [])

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
        {version && (
          <Tooltip
            title={
              pending
                ? `Version ${pending} is available. Click to install.`
                : supported
                  ? 'Check for updates'
                  : 'Updates are off in this build'
            }
          >
            <button
              type="button"
              disabled={!supported}
              onClick={() => void api.checkForUpdates()}
              className={`h-5 flex items-center gap-1 px-1.5 rounded text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-(--color-primary) ${
                pending
                  ? 'bg-(--color-primary) text-white cursor-pointer'
                  : supported
                    ? 'text-(--color-mute) cursor-pointer hover:bg-black/5 hover:text-(--color-body)'
                    : 'text-(--color-mute) cursor-default'
              }`}
            >
              {pending ? `Update to v${pending}` : `v${version}`}
            </button>
          </Tooltip>
        )}
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
