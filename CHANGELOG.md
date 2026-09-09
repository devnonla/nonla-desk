# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
