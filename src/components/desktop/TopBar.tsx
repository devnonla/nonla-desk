import AppLogo from '../ui/AppLogo'

/**
 * Replaces the window title bar: the macOS traffic lights float over its left
 * edge (TitleBarStyle::Overlay, see src-tauri/src/shell.rs), the empty parts drag
 * the window. No background: the wallpaper shows through. Search is ⌘K, import is
 * in the File menu, version and updates are in the Nonla Desk window.
 */
export function TopBar() {
  return (
    <header
      data-tauri-drag-region
      className="absolute inset-x-0 top-0 z-40 h-11 flex items-center pl-21 pr-3 select-none"
    >
      <div data-tauri-drag-region className="flex flex-1 items-center gap-2 min-w-0 self-stretch">
        <AppLogo size={18} />
        <span
          data-tauri-drag-region
          className="text-[13px] font-semibold text-white drop-shadow-sm"
        >
          Nonla Desk
        </span>
      </div>
    </header>
  )
}
