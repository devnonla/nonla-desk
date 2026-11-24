# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Nonla Desk is a macOS-only Electron app (electron-vite, React 19, Tailwind 4, better-sqlite3). It is a "desktop" that hosts **mini apps**. AI agents write those mini apps, either through the built-in MCP server or through the in-app Agent chat.

## Commands

Bun is the package manager. There is no test suite.

```bash
bun install              # also runs electron-builder install-app-deps (rebuilds better-sqlite3 for Electron)
bun dev                  # electron-vite dev with HMR for the renderer
bun run build            # build main + preload + renderer into out/
bun run check            # Biome lint + format, auto-fix
bun x tsc --build --noEmit                 # typecheck (project refs: tsconfig.node.json + tsconfig.web.json)
bun .cursor/hooks/lint-tailwind.mjs        # Tailwind language-server diagnostics (canonical classes, conflicts)
bun run build:mac        # DMG + zip in dist/
bun run local            # package, quit the running app, replace /Applications/Nonla Desk.app, relaunch
```

Run these checks in order before you call a change done (the repo's agent stop-hook does the same): `bun x biome check --error-on-warnings .`, then the Tailwind lint, then `tsc`, then `bun run build`. Warnings count as failures.

CI (`.github/workflows/build.yml`) runs on every push to `main`. It builds arm64 + x64 and creates or updates the GitHub release `v<package.json version>`, so pushing to main publishes a release.

## Architecture

### Processes
- **Main** (`src/main/index.ts`) creates the window and tray, registers IPC (`setupMiniAppIPC`, `setupAgentIPC`, `setupLlmProviderIPC`, plus `config:get/set`), loads enabled mini apps, and starts the MCP server. The app holds a single-instance lock. In production, closing the window hides it to the tray. In dev, closing quits, and the app is named "Nonla Desk Dev".
- **Preload** (`src/preload/index.ts`) exposes everything on `window.api`. The renderer gets its types from `ElectronAPI` via `src/renderer/src/env.d.ts`. A new IPC channel needs a handler in main and an entry here.
- **Renderer**: one bundle, two entry modes. `main.tsx` renders `TrayPanel` when the URL has `?panel=tray` (the tray window created in `src/main/tray.ts`). Otherwise it renders `App` under a `HashRouter`. In `App`, `Dashboard` is the desktop. Every route (`/mini/:appId`, `/mini-apps/new`, `/mini-apps/edit/:appId`, `/settings`, `/agent`) renders inside a `DesktopWindow` overlay on top of it.

### Data
- SQLite lives at `<userData>/data/nonla-desk.db` (WAL). The schema is defined twice and the two must stay in sync: raw `CREATE TABLE IF NOT EXISTS` in `src/main/db/index.ts` (this is what actually creates the tables; there are no migrations), and Drizzle definitions in `src/main/db/schema.ts`. Most code uses `getSqlite()` with raw SQL, not Drizzle queries.
- Tables: `configurations` (global key/value; the agent's state is stored under `assistant.*` keys), `mini_apps` (metadata only), `mini_app_storage` (per-app key/value; also holds `__config_schema__` and `config::<key>` values), `llm_providers`.

### Mini apps
The core of the app is `src/main/mini-app-runtime.ts`.
- **Code lives on the filesystem**, not in the DB: `~/.nonla-desk/apps/<id>/{frontend/index.jsx, backend/index.js, panel/index.jsx, manifest.json}`, plus an optional `package.json` (`npm install --production` runs once if `node_modules` is missing).
- **Frontend/panel** code runs in the renderer. `src/renderer/src/lib/miniapp-helpers.ts` transpiles JSX with Sucrase (pragma `__jsx`) and evaluates it with `new Function`. The source must be `module.exports = function Name({ ctx })`, with no imports. `ctx` comes from `buildFrontendContext` (React hooks, `ui` = `components/ui/MiniAppUI.tsx`, `icons` = lucide, `ipc`, `storage`, `media`, `notify`, `tray`). Manual `createElement`/`h()` calls are rejected.
- **Backend** code runs in a forked child process via `resources/sandbox-runner.js` (shipped as an extraResource). The child has no direct DB or Electron access. It sends typed messages (`storage:*`, `db:*`, `electron:shell|dialog|clipboard|notification`, `ipc:send`, `log`), which `loadBackendCode` handles and answers with `{type:'response', requestId}`. SQL from `ctx.db` is rewritten by `prefixTables` so tables become `miniapp_<first 8 of id>_<name>`. If the backend exits non-zero or fails to load, the app is auto-disabled.
- Every create, update, delete, or toggle broadcasts `miniapp:changed`. The renderer listens through `useMiniAppChanges` and live-reloads the desktop and open windows.
- **Adding a capability to the mini-app API** usually touches all of these: `sandbox-runner.js` (backend ctx), the message switch in `mini-app-runtime.ts`, `preload/index.ts`, `buildFrontendContext`, and **`src/main/mcp/guide.ts`** (the guide agents read before writing code; it is currently v3).
- Tailwind never scans mini-app code. A class that mini apps may use must exist in `src/renderer/src/lib/miniapp-tailwind-safelist.ts` (pulled in through `@source` in `index.css`). Don't prune entries that look unused.

### MCP server and in-app Agent
- `src/main/mcp-server.ts` runs a Streamable HTTP MCP server on `127.0.0.1:24816` (packaged) or `24817` (`bun dev`), with a host check and session TTL. The renderer reads the live port over IPC (`mcp:info`), so don't hardcode it.
- Each tool is a `ToolModule` (`{definition, handler}`) in its own file under `src/main/mcp/`, registered in `src/main/mcp/index.ts`. Handlers return `ok(payload)` or throw with `fail(msg)`, which produces an `isError` result.
- `src/main/agent.ts` is the in-app Agent: a LangGraph `createReactAgent` over OpenAI, Anthropic, Google, or OpenRouter models, configured in `llm-providers.ts` and `constants.ts`. It reuses the same `TOOLS`/`handleTool` registry and converts each JSON schema to Zod. A new MCP tool therefore shows up in both places, but a schema type `schemaFor` doesn't handle will need support there. Tokens and tool events stream to the renderer as `assistant:event`.

## Conventions

- **UI design must follow `.cursor/DESIGN.md`** (project rule). Key points: amber `#EB9D29` is the only accent; window interiors use the cream canvas with 1px hairline borders; Inter for text and SF Mono for code and numbers; buttons have a 6px radius, and only status tags use pills.
- **No hand-written CSS. Style with Tailwind only** (project rule). Use theme tokens through CSS variables, e.g. `text-(--color-ink)`, `bg-(--color-canvas-soft)`, `border-(--color-hairline)`, not hex values.
- `@/` resolves to `src/renderer/src`. `components/shadcn/` (shadcn CLI) and `components/ai-elements/` (AI SDK Elements registry) are vendored and excluded from Biome. Prefer regenerating them over hand-editing.
- Biome: 2-space indent, single quotes, semicolons only where needed, 100-column lines, imports auto-organized.
- Conventional Commits with process scopes, e.g. `feat(main): …`, `feat(web): …`, `fix: …`. Releases are `chore: release vX.Y.Z` and bump the `package.json` version.
- `.cursor/` and `scripts/` (except `install.sh`) are gitignored, so `scripts/local.sh` and `scripts/release.sh` exist only locally.
