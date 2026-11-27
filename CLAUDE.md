# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Nonla Desk is a macOS-only Tauri 2 app (Rust core, React 19 + Tailwind 4 + devnonla-ui webview). It is a "desktop" that hosts **mini apps**. Coding agents write mini apps through the `nonladesk` CLI. There is no MCP server, no in-app LLM agent and no settings window, on purpose; don't reintroduce them. Everything is local, with no auth.

## Commands

Bun is the package manager; Rust stable builds the core.

```bash
bun install
bun dev                     # tauri dev: Vite on :1420 + debug app (dev DB, dev socket)
bun nonladesk <cmd>             # run the CLI against the dev app (src-tauri/target/debug/nonla-desk)
bun run build:web           # tsc + vite build (frontend only)
bun run build               # scripts/build-app.ts: release app + DMG (universal by default)
bunx tauri build --debug --bundles app    # quick debug .app bundle
cargo test --manifest-path src-tauri/Cargo.toml --lib    # Rust unit tests (e.g. backend::tests)
cargo test --manifest-path src-tauri/Cargo.toml --lib prefixes_table_names   # one test
bun run check               # Biome lint + format, auto-fix
bun x tsc --noEmit          # typecheck
bun .cursor/hooks/lint-tailwind.mjs       # Tailwind canonical-class/conflict check (local file)
```

Before calling a change done: `bun x biome check --error-on-warnings .`, the Tailwind check, `tsc`, `bun run build:web`, and `cargo clippy` / `cargo fmt` in `src-tauri/`. Warnings count as failures. There is no JS test suite.

CI (`.github/workflows/build.yml`) runs on every push to `main`: Rust tests, universal build, and creates/updates the GitHub release `v<package.json version>`. Pushing to main publishes.

## Architecture

### One binary, two roles
`src-tauri/src/main.rs`: if invoked as `nonladesk` (symlink) or with any argument, it runs the CLI (`cli.rs`, clap) and never starts Tauri. Otherwise it starts the app (`lib.rs`). The release app links `~/.local/bin/nonladesk` to itself on launch (`cli::ensure_link`).

### CLI ↔ app
- `server.rs` listens on a Unix socket (`~/.nonla-desk/nonladesk.sock`, `nonladesk-dev.sock` for debug builds, `NONLADESK_SOCKET` override, mode 0600). One JSON line per request: `{"cmd","args"}` → `{"ok","data"|"error"}`. `dispatch` is the whole command surface; a new CLI command needs a `Cmd` variant in `cli.rs` and a `dispatch` arm.
- The CLI sends file *contents* (it reads paths client-side). If the socket is missing, a release CLI `open`s the app and retries; a debug CLI tells you to run `bun dev`.
- `nonladesk check` runs in the webview: `check.rs` emits `check:request` to the main window, `src/lib/miniapp-check.ts` transpiles with the same Sucrase setup the renderer uses, and answers through the `check_result` command.

### Data (`~/.nonla-desk/`)
- `apps/<id>/{manifest.json, icon.svg, frontend/index.jsx, backend/index.js, panel/index.jsx}`: code lives on disk, the source of truth.
- `data/nonla-desk.db` (`nonla-desk-dev.db` in debug), rusqlite, WAL, foreign keys on. Schema is the `SCHEMA` string in `db.rs` (no migrations; `CREATE TABLE IF NOT EXISTS`). Tables: `configurations`, `mini_apps` (metadata only), `mini_app_storage` (per-app KV, also `__config_schema__` and `config::<key>`), plus backend-created `miniapp_<id8>_*` tables. On first launch the Electron-era DB is copied over with `VACUUM INTO` (`db::migrate_from_electron`).
- `logs/updater.log`.

### Layers in `src-tauri/src`
- `miniapp.rs`: pure data layer (records, files, storage, config, ZIP import/export). No processes, no events.
- `ops.rs`: what the UI and CLI both call: data change + backend restart + `miniapp:changed` broadcast. Add behavior here, not in `commands.rs` or `server.rs`.
- `backend.rs`: one child process per enabled app with a backend, running `resources/sandbox-runner.cjs` under Bun (or Node; `runtime.rs` finds them in fixed paths because Finder-launched apps get a minimal PATH). Protocol over stdio: child→app lines prefixed with `\x1e`, app→child JSON lines on stdin; other output becomes logs (ring buffer, `nonladesk logs`). The child asks for `storage:*`, `db:*`, `host:{shell,dialog,clipboard,notification}`; `ctx.db` SQL is rewritten by `prefix_tables`. A non-zero exit auto-disables the app.
- `commands.rs`: Tauri commands for the UI. `shell.rs`: main window, tray icon + popover panel window (`tray`), menu bar menu. `updater.rs`: in-app updates.
- **Adding a capability to the mini-app API** touches `sandbox-runner.cjs` (backend ctx), `backend.rs::handle_message`, `src/lib/api.ts`, `buildFrontendContext` in `src/lib/miniapp-helpers.ts`, and the guide (see Plugin).

### Updates
Same model as open-agent-hands. `tauri-plugin-updater` is compiled in only when `scripts/build-app.ts` has `NONLA_UPDATER_PUBKEY`, `TAURI_SIGNING_PRIVATE_KEY` and `GITHUB_REPOSITORY` (or `NONLA_UPDATER_ENDPOINT`); it passes them via `--config` and compile-time env (`option_env!`). Builds without keys have no updater. CI reads `vars.TAURI_UPDATER_PUBKEY` and `secrets.TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)`; `scripts/updater-manifest.ts` writes `release/latest.json` (one universal archive for both arches). The updater rejects an archive whose signed version differs from the manifest version.

### Frontend (`src/`)
- `src/lib/api.ts` wraps every `invoke`/`listen`; components never call Tauri directly.
- There is no native title bar: `TitleBarStyle::Overlay` floats the traffic lights over `components/desktop/TopBar.tsx` (44px, `data-tauri-drag-region`). Windows (`DesktopWindow`) open in the area below it; the wallpaper is `src/assets/desktop-bg.jpg` (shared with the open-agent-hands sign-in screen), drawn in `Dashboard.tsx`.
- App icons: `icon.svg` in the app folder (validated by `miniapp::validate_svg_icon` on write, re-checked and id-prefixed by `src/lib/svg-icon.ts` before drawing). `AppIcon` draws it when valid, else the named emoji icon.
- `main.tsx` picks `TrayPanel` when the window label is `tray`, otherwise `App`, all inside devnonla-ui's `<App>` (light mode). There is no router: several in-app windows can be open at once, managed by `hooks/useWindows.tsx` (open/focus/close, z-order, cascade slot). A window is `app:<id>` (MiniAppRenderer) or `info:<id>` (MiniAppViewer: read-only details, code, logs and the app's config values; code is never edited in the UI); opening one that exists raises it, and a disabled app opens its details. `navigate-tool` events from Rust (`nonladesk open`, menus) map to `open()`.
- Mini app frontend/panel code is evaluated in `miniapp-helpers.ts` (Sucrase JSX, cached per source; `module.exports = function Name({ ctx })`, `ctx.ui` = `components/ui/MiniAppUI.tsx`, which also exports devnonla-ui's `Icon`). Keep `ctx.ui` names and props stable: existing apps depend on them, but it is optional: the guide and the starter app don't push it, and apps may `import` any library (`src/lib/miniapp-modules.ts`: esm.sh with the desktop's React via the import map in `index.html` and `public/vendor/*`, regenerate those four files when React is upgraded). There is no icon pack: `ctx.icons` throws, and apps draw missing icons as inline SVG. The app UI uses `components/ui/icons.tsx` (devnonla-ui `Icon` plus a few drawn glyphs); don't add lucide back.
- Performance: `main.tsx` lazy-loads `App` or `TrayPanel` per window; the mini app runtime, editor and onboarding are separate chunks (the runtime is prefetched right after the desktop paints). `src/lib/api.ts` keeps one Tauri listener per busy event (`miniapp:ipc-message`, `miniapp:changed`, `miniapp:log`) and fans out in JS, so `ctx.ipc.on()` subscribes synchronously. `App` owns the mini app list and passes it down; don't add more `listMiniApps` callers.
- Tailwind never scans mini app code: classes they may use must be in `src/lib/miniapp-tailwind-safelist.ts`. Don't prune it.

### Plugin
`plugins/nonla-desk/` is the Claude Code plugin (marketplace in `.claude-plugin/marketplace.json`) with two skills. `skills/nonla-desk/` is local only: `SKILL.md` (short index) and `references/` `install.md`, `develop.md`, `icon.md`. `skills/nonla-market/` is sharing: `SKILL.md` and `references/` `share.md` (commands, zip and marketplace format) and `review.md` (the read-every-file procedure before installing someone else's app). `develop`, `icon`, `share` and `review` are compiled into the CLI (`nonladesk guide [develop|icon|share|review]`, `include_str!` in `cli.rs`). Keep them in step with CLI commands and the `ctx` API.

## Conventions

- **UI uses devnonla-ui components** (`Card`, `Button`, `CommandPalette`, `Modal.confirm`, `message`, …) before custom ones; the look is a cream canvas with an amber accent. Theme overrides live on `.nonla-ui.light` in `src/assets/index.css`. `--color-*` tokens on `:root` are kept because mini apps use them.
- **No hand-written CSS; Tailwind only.** Window dragging uses `data-tauri-drag-region`, not `-webkit-app-region`.
- `@/` resolves to `src/`. Biome: 2-space indent, single quotes, semicolons as needed, 100 columns.
- Conventional Commits with scopes like `feat(core)`, `feat(cli)`, `feat(web)`, `fix(updater)`. Releases are `chore: release vX.Y.Z` and bump `package.json`; bump `plugin.json` when the plugin changed.
- `.cursor/` and `scripts/` (except `install.sh`, `build-app.ts`, `updater-manifest.ts`) are gitignored.
