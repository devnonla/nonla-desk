# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
