# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.2] - 2026-11-26

### Added
- A "Nonla Desk" icon on the desktop (and Nonla Desk ▸ About Nonla Desk) opens a page with the version, update check, how to build mini apps with your agent and the shortcuts. A red dot on the icon means an update is available
- File ▸ Import Mini App… (⌘O) in the menu bar

### Changed
- The top bar has no background, search input or import button: ⌘K still searches, import moved to the File menu
- Menu bar panel: the desktop wallpaper edge to edge with desktop-style icons and a glass edge, panels of mini apps fill it without padding, and an empty panel shows the clock
- New logo (hat with an infinity sign) and menu bar icon
- When the window is closed the Dock icon goes away and only the menu bar icon stays, like Apple Passwords. Opening the window brings it back

### Fixed
- 0.5.0 did not open (the app mistook itself for the CLI) and was withdrawn; the app binary is `nonla-desk` again and `nonladesk` is only the CLI link
- Debug builds no longer defer to an installed Nonla Desk, so `bun dev` runs next to it

## [0.5.1] - 2026-11-26

### Fixed
- 0.5.0 did not open: the app binary was renamed to `nonladesk` too, so it mistook itself for the CLI and exited. The app binary is `nonla-desk` again; `nonladesk` is only the CLI link

## [0.5.0] - 2026-11-26

### Added
- The top bar shows the running version. It turns into "Update to vX" when a newer release is found; click it (or the version) to check for updates and install

### Changed
- **Breaking:** the CLI is now `nonladesk` instead of `nonla`, and so are the binary and the socket (`~/.nonla-desk/nonladesk.sock`, `NONLADESK_SOCKET`). `~/.local/bin/nonladesk` replaces the old link and `nonla` is removed on launch. Update any agent instructions or scripts that call `nonla`; the plugin is updated to match
- The CLI is now `nonladesk` instead of `nonla` (`~/.local/bin/nonladesk`; the old `nonla` link is removed on launch). Update any agent instructions or scripts that call `nonla`

## [0.4.1] - 2026-11-26

### Changed
- Like Apple Passwords, Nonla Desk and native apps with a menu bar panel drop their Dock icon while their window is closed and only keep the menu bar icon; opening the window from the menu bar brings the Dock icon back

## [0.4.0] - 2026-11-25

### Added
- Install a mini app as its own macOS app: right-click its icon → Install as Native App, or `nonla install <app>` (`~/Applications/Nonla Apps`). It has its own Dock icon, window and menu bar icon with the app's panel, and runs without the desktop open
- Native apps show a badge on the desktop and open from there (icon, ⌘K, `nonla open`); Remove Native App or `nonla uninstall` takes them back into the desktop
- Mini app frontends and panels can `import` any npm package or https URL (antd, dayjs, …) and CSS files; React is shared with the desktop and the first run pins the version it resolved so later runs use the cache. See "Libraries" in `nonla guide`
- `export default function` is accepted next to `module.exports`

### Changed
- `ctx.ui` (devnonla-ui) is optional: it still works for existing apps, but the guide and the `nonla create` starter no longer use it
- Requires Rust 1.89 or newer to build

## [0.3.0] - 2026-11-24

### Changed
- Rebuilt on Tauri 2 with a Rust core instead of Electron: a smaller, faster app with the same mini apps
- Agents manage mini apps with the `nonla` CLI instead of MCP (`nonla guide`, `create`, `check`, `reload`, `enable`, `logs`, `open`, …); nothing to sign in to
- Mini app backends run on Bun, or Node.js when Bun is missing; the installer sets up Bun and links `~/.local/bin/nonla`
- Data moved to `~/.nonla-desk/` (the Electron database is migrated on first launch)
- New desktop: rice-field sunset wallpaper, a clock, macOS-style icons and labels, and a top bar with search (⌘K) and import
- Several mini apps can be open at once: macOS-style windows you can move, resize and zoom, which reopen where you left them
- Details window (right-click → Details) is read-only: code with highlighting, live logs, and the app's settings
- Mini app icons are agent-drawn SVGs (`--icon-file icon.svg`); the existing apps got a matching set
- System Monitor redesign: gauges, activity chart, per-core load, and correct memory and disk numbers on macOS
- Faster start and app opening: lazy-loaded chunks (initial JS down from 1.8 MB to 0.37 MB) and one shared event bus

### Added
- In-app updates from GitHub releases (signed), with Check for Updates… in the menu bar
- `nonla-desk` Claude Code plugin skill (`/plugin marketplace add devnonla/nonla-desk`)
- `ctx.ui.Icon` for mini apps (devnonla-ui glyphs)

### Removed
- MCP server, the in-app Agent chat with LLM providers, the Settings window, and the in-app code editor
- `ctx.icons` (the lucide icon pack): use `ctx.ui.Icon` or draw an inline SVG; `nonla check` flags old usage
- Screen capture sources for mini apps (`ctx.media.getDesktopSources` returns `[]`)

## [0.2.2] - 2026-09-09

### Added
- Mini apps reload live when MCP or the editor creates, updates, deletes, or disables them
- “Updating app” overlay (and a dock spinner) while an open app is disabled during those changes

### Changed
- App logo and menu-bar tray icon: nón lá plus a terminal prompt mark
- Tray Quick Tools list is denser: icon and name only, no description rows

## [0.2.1] - 2026-09-08

### Added
- MCP connect card on an empty desktop, with steps for Cursor, Claude Code, or Antigravity
- `scripts/install.sh` so the README curl installer works

### Changed
- Sample Quick Note is no longer seeded on first launch; the connect card stays until a mini app exists

### Fixed
- GitHub Actions `nullglob` so macOS release assets are uploaded correctly

### Upgrade notes
- Fresh installs show the connect card instead of Quick Note. Existing mini apps are unchanged.

[0.2.2]: https://github.com/devnonla/nonla-desk/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/devnonla/nonla-desk/compare/v0.2.0...v0.2.1
