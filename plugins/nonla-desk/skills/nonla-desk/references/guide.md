# Nonla Desk — Mini App Development Guide (v3)

> **IMPORTANT**: Read this entire guide BEFORE writing any mini app code.
> Mini apps run inside the Nonla Desk desktop app (Tauri). Code is stored on filesystem (~/.nonla-desk/apps/), evaluated at runtime.

---

## Architecture Overview

A mini app consists of up to 3 code files, each a JavaScript string:

| File | Role | Required | Runs In |
|---|---|---|---|
| `frontendCode` | Main UI shown when user opens the app | ✅ Yes | Renderer (browser) |
| `backendCode` | Background logic, API calls, data processing | ❌ Optional | Child process (Bun, or Node.js) |
| `panelCode` | Small widget shown in the Quick Tools tray panel | ❌ Optional | Renderer (browser) |

### Communication Flow

```
┌──────────────┐    ctx.ipc     ┌──────────────┐
│  Frontend    │ ◄────────────► │   Backend    │
│  (React UI)  │  send/on       │ (Bun / Node) │
└──────────────┘                └──────────────┘
       ▲                               ▲
       │ ctx.ipc                       │ ctx.storage
       ▼                               │ ctx.db
┌──────────────┐                       ▼
│  Panel Code  │               ┌──────────────┐
│ (Tray widget)│               │   SQLite DB  │
└──────────────┘               └──────────────┘
```

---

## Managing apps with the `nonla` CLI

Nonla Desk must be running (the CLI starts it if it is installed). Every command takes an app **id or name**. Add `--json` before the command for machine-readable output.

### ⚠️ Never clone an existing app

App **name is unique**. `nonla create` with a name that already exists **fails** and prints the existing id. Edit that app instead. Do not create "Quick Note 2" or a copy to iterate.

### Workflow

1. `nonla list` to find the app. Never guess ids.
2. New app: write the files anywhere, then
   `nonla create "My App" --frontend ./frontend.jsx [--backend ./backend.js] [--panel ./panel.jsx] --icon-file ./icon.svg --category "Dev Tools" --description "..."`.
   Without `--frontend`, a starter component is written for you.
3. Existing app: edit its files **in place**. `nonla path <app>` prints the directory:
   `frontend/index.jsx`, `backend/index.js`, `panel/index.jsx`, `icon.svg`, `manifest.json`.
   Or replace one file: `nonla write <app> frontend ./file.jsx` (or `-` for stdin).
4. After any change: `nonla check <app>` (transpiles JSX with the runtime's own compiler and checks syntax and `module.exports`).
5. Apply: `nonla reload <app>` re-reads the files, restarts the backend, and refreshes open windows. `nonla write` reloads by itself.
6. New apps start **disabled**. `nonla enable <app>` turns one on (fails if required config is missing).
7. Backend problems: `nonla logs <app>` prints recent `ctx.log`, stdout/stderr, and crashes. A backend that exits with an error is disabled automatically.
8. `nonla open <app>` shows the app in Nonla Desk so the user can see it.

Other commands: `nonla get <app> [--file frontend|backend|panel]`, `nonla update <app> --name/--description/--icon-file/--category/--version` (metadata only), `nonla disable <app>`, `nonla delete <app> --yes`, `nonla import <zip|dir>`, `nonla export <app> -o out.zip`, `nonla status`, `nonla guide`.

```bash
nonla create "Password Generator" --frontend /tmp/pw/frontend.jsx --backend /tmp/pw/backend.js --icon-file /tmp/pw/icon.svg --category "Dev Tools"
nonla check "Password Generator"
nonla enable "Password Generator"
# later, after editing ~/.nonla-desk/apps/<id>/frontend/index.jsx:
nonla check "Password Generator" && nonla reload "Password Generator"
```

### Icon (draw one for every app)

Each app shows an icon on the desktop (48px), in the top bar, the ⌘K palette and the menu bar panel (16px). Draw it as one inline SVG and pass it with `--icon-file icon.svg` on `create` or `update`. It is stored as `icon.svg` in the app folder: edit it in place, then `nonla reload <app>`. `nonla check <app>` checks it too. Without a valid SVG the desktop falls back to a generic emoji.

How it is shown:
- As-is, no tint and no tile behind it. You design everything: shape, colors, background.
- Draw for 16–32px: a few bold shapes, no thin hairlines, no text.
- `currentColor` is the ink color (#1d1d1d). Use it for a neutral line icon; set explicit `fill`/`stroke` colors for a colored one. Keep related apps in one style.

Rules (`create`/`update` fail with the reason otherwise):
- Starts with `<svg`, ends with `</svg>`, has a square `viewBox` (`0 0 24 24` or `0 0 48 48`), under 8000 characters.
- Elements: `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `g`, `defs`, `linearGradient`, `radialGradient`, `stop`, `clipPath`, `mask`, `title`, `desc`.
- Not allowed: `<script>`, `<style>` (use attributes), `<image>`, `<foreignObject>`, `<use>`, `on…=` handlers, `javascript:`, and `href` to anything but an `#id` inside the icon. `id`s are fine; they never clash between icons.

Line icon:
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
```

House style (use this for every app so the desktop looks like one set): a 42px rounded square with a vertical gradient, a top highlight, and one bold white glyph. Desktop icons are shown at 48px with no tile behind them. Pick a color that is not already used by another app (`nonla list` and look at the desktop): amber, yellow, violet, slate, blue, green, teal, rose…

```svg
<svg viewBox="0 0 48 48"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#62b0f7"/><stop offset="1" stop-color="#2b6fd6"/></linearGradient><linearGradient id="hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect x="3" y="3" width="42" height="42" rx="11" fill="url(#bg)"/><rect x="3" y="3" width="42" height="42" rx="11" fill="url(#hl)"/><path d="M12.5 17l2.6 2.6 4.6-4.6M12.5 25l2.6 2.6 4.6-4.6" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 17.5h12M24 25.5h12" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/></svg>
```

Keep the glyph inside x/y 10–38, strokes 2.5–3.5 wide, one or two accent colors at most.

---

## ⚠️ Spacing is not optional (CRITICAL)

The host CSS resets **all** padding and margin (`* { margin: 0; padding: 0 }`).
The parent window has **no padding** and `overflow: hidden`.

Mini app JSX is **evaluated at runtime**. Tailwind only emits classes that already exist in the **host renderer**. A class you invent in mini app code (`gap-7`, `p-[18px]`, `text-[var(--color-ink)]`) is silently dropped. That is why agent UIs look glued together.

**Do not write a layout as a pile of Tailwind `div`s.** Use `ui.Space` for every row and column. It sets inline `gap`, so it always works.

### Required layout

```javascript
return (
  <div className="h-full overflow-y-auto p-6">
    <ui.Space direction="vertical" size={16} className="w-full">
      <ui.Space size={12} className="w-full">
        <h2 className="m-0 text-sm font-semibold text-(--color-ink)">Title</h2>
        <ui.Button type="primary">Action</ui.Button>
      </ui.Space>
      <ui.Card title="Section">
        Body copy. Card already pads its body with 16px.
      </ui.Card>
    </ui.Space>
  </div>
)
```

- Root **must** have `p-6` (24px). Full-bleed only for editors/canvases, and still pad the chrome.
- Vertical stacks: `<ui.Space direction="vertical" size={16} className="w-full">`
- Horizontal rows: `<ui.Space size={12}>` (`size` is px: 8 small, 16 middle, 24 large, or a number)
- Cards: `ui.Card` (header + 16px body). Do not fake cards with unpadded bordered divs.
- Dynamic widths (progress bars): `style={{ width: pct + '%' }}` — never a made-up class.

Fixed header + scrollable body:

```javascript
return (
  <div className="h-full flex flex-col">
    <div className="shrink-0 p-6 pb-4">
      <ui.Space size={12} className="w-full">
        <h2 className="m-0 text-sm font-semibold text-(--color-ink)">Title</h2>
        <ui.Button size="small">Refresh</ui.Button>
      </ui.Space>
    </div>
    <div className="flex-1 overflow-y-auto px-6 pb-6">
      <ui.Space direction="vertical" size={16} className="w-full">
        {/* sections */}
      </ui.Space>
    </div>
  </div>
)
```

## Frontend Code

### Module Pattern

Frontend code MUST export a React component function using CommonJS:

```javascript
module.exports = function MyApp({ ctx }) {
  const { useState, useEffect, useCallback, ui } = ctx

  const [count, setCount] = useState(0)

  return (
    <div className="h-full overflow-y-auto p-6">
      <ui.Space size={8}>
        <ui.Icon name="stars" size={16} className="text-(--color-primary)" />
        <span className="text-sm text-(--color-ink)">{count}</span>
        <ui.Button type="primary" onClick={() => setCount(count + 1)}>+1</ui.Button>
      </ui.Space>
    </div>
  )
}
```

### The ctx Object (Frontend)

```javascript
ctx.appId         // string — unique ID of this mini app
ctx.React         // React library

// React Hooks
ctx.useState, ctx.useEffect, ctx.useRef, ctx.useCallback, ctx.useMemo

// UI Component Library (see below)
ctx.ui            // e.g. ctx.ui.Button, ctx.ui.Input, ctx.ui.Card, ctx.ui.Modal

// Icons: devnonla-ui glyphs (see "Icons" below). There is no icon pack;
// draw anything else as an inline <svg>.
<ctx.ui.Icon name="copy" size={16} className="..." />

// IPC (communicate with backend)
ctx.ipc.send(channel, data)     // Send message to backend
ctx.ipc.on(channel, handler)    // Listen for messages, returns cleanup fn

// Persistent Storage (key-value, async)
ctx.storage.get(key)            // Promise<string | null>
ctx.storage.set(key, value)     // Promise<{ success }>
ctx.storage.delete(key)         // Promise<{ success }>
ctx.storage.getAll()            // Promise<Record<string, string>>

// Media APIs
ctx.media.getDesktopSources(opts?)  // always [] — screen capture is not available
ctx.media.getMediaAccess(type)      // use navigator.mediaDevices.getUserMedia for camera/mic
ctx.media.askMediaAccess(type)

// Notifications
ctx.notify(title, body?, opts?)

// Tray popup (Quick Tools panel)
ctx.tray.hide()                 // Dismiss the tray popup (e.g. before an eyedropper)
```

### Icons

There is no icon pack (`ctx.icons` was removed and fails with an error). Two options:

1. **`ui.Icon`**: the devnonla-ui glyphs, drawn in the app's line style. Props: `name`, `size` (default 16), `stroke`, `className`. It takes no `onClick`: put it inside a `ui.Button` or `<button>`.

   Names: `add` `arrow-back` `arrow-down` `arrow-forward` `arrow-left` `arrow-right` `arrow-up` `book` `check` `checkbox` `chevrons-left` `chevrons-right` `clock` `close` `code` `copy` `datetime` `dialog` `document` `download` `eraser` `error` `eye` `globe` `json` `maximize` `md` `minimize` `monitor` `moon` `more` `panel` `pen` `pointer` `refresh` `search` `select` `send` `shield-check` `stars` `stop` `sun` `text` `transfer` `trash` `window`

2. **Draw it** as an inline `<svg>` in your file when no glyph fits (a CPU, a palette, a key…). Use a 24×24 viewBox, `stroke="currentColor"`, round caps, so it matches `ui.Icon`:

```javascript
function KeyIcon({ size = 16, className }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8.5-8.5M16 7l2.5 2.5" />
    </svg>
  )
}

module.exports = function MyApp({ ctx }) { /* … <KeyIcon size={16} /> … */ }
```

Helpers like `KeyIcon` go above `module.exports` (JSX works there too).

### JavaScript Rules

**Code runs in a Function constructor inside the app's WebKit webview (Safari engine).**
**JSX is auto-transpiled by Sucrase at runtime — use JSX syntax directly.**

1. **Use `module.exports = function`** — no import/export
2. **Write JSX directly** — `<div className="p-6">` works out of the box (auto-transpiled)
3. **Modern JS OK** — `const`/`let`, arrow functions, `async/await`, `?.`, `??`, spread `{...obj}` all work fine
4. **No `import`/`export`** — this is the only real restriction
5. **Do NOT use `ctx.h()` or `React.createElement()`** — always write JSX

```javascript
// ✅ CORRECT — Use JSX
module.exports = function MyApp({ ctx }) {
  const { useState, useEffect } = ctx
  const [items, setItems] = useState([])

  useEffect(() => {
    const off = ctx.ipc.on('data', (d) => setItems(d ?? []))
    ctx.ipc.send('load', {})
    return off
  }, [])

  return (<div className="h-full overflow-y-auto p-6 text-sm text-(--color-ink)">{items.length} items</div>)
}

// ❌ WRONG — no import/export
import React from 'react'
export default ({ ctx }) => { ... }

// ❌ WRONG — do NOT use ctx.h() or React.createElement()
return ctx.h('div', { className: 'p-6' }, items.length, ' items')
```

---

## Backend Code (v2 — Child Process)

Backend runs in its own child process under Bun (Node.js if Bun is missing). Node built-ins work in both.
- `console.log` output and crashes show in `nonla logs <app>`
- Modern JS OK: const, let, =>, async/await, ?., ??
- Can require() npm packages
- Storage and DB are **async** (require await)

### Module Pattern

```javascript
module.exports = async function setup(ctx) {
  ctx.log('Backend loaded')

  ctx.ipc.on('load-data', async () => {
    const raw = await ctx.storage.get('mydata')
    const data = raw ? JSON.parse(raw) : []
    ctx.ipc.send('data-loaded', data)
  })

  ctx.ipc.on('save-data', async (payload) => {
    await ctx.storage.set('mydata', JSON.stringify(payload))
    ctx.ipc.send('data-loaded', payload)
  })

  // Return cleanup function
  return () => ctx.log('Cleanup')
}
```

### The ctx Object (Backend)

```javascript
ctx.appId, ctx.log(...args)

// IPC
ctx.ipc.on(channel, handler)    // Listen from frontend
ctx.ipc.send(channel, data)     // Send to frontend

// Storage (ASYNC — use await)
await ctx.storage.get(key)        // Promise<string | null>
await ctx.storage.set(key, value) // Promise<boolean>
await ctx.storage.delete(key)     // Promise<boolean>
await ctx.storage.getAll()        // Promise<Record<string, string>>

// Scoped SQLite Database (ASYNC — table names auto-prefixed)
await ctx.db.run(sql, ...params)  // INSERT, UPDATE, DELETE, CREATE TABLE
await ctx.db.get(sql, ...params)  // Single row
await ctx.db.all(sql, ...params)  // All rows

// Node.js APIs (native)
ctx.require, ctx.fs, ctx.path, ctx.os, ctx.crypto, ctx.childProcess

// Host APIs (proxied to the app, return Promises; Electron-style options)
ctx.shell.openExternal(url), ctx.shell.openPath(path)
ctx.dialog.showOpenDialog(opts)   // { canceled, filePaths }
ctx.dialog.showSaveDialog(opts)   // { canceled, filePath }
ctx.dialog.showMessageBox(opts)   // { response } — first two buttons only
ctx.clipboard.readText()
ctx.clipboard.writeText(text)

// Utilities
ctx.fetch              // Native fetch
ctx.appPath            // ~/.nonla-desk
ctx.homePath           // Home directory
ctx.tmpPath            // Temp directory

// Timers (auto-cleaned on unload)
ctx.setTimeout, ctx.setInterval, ctx.clearTimeout, ctx.clearInterval

// Config (from manifest)
ctx.config             // { key: value } from user settings
```

### Database Example

Table names are auto-prefixed with `miniapp_{shortId}_`:

```javascript
// You write:
await ctx.db.run('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, text TEXT)')
// Runtime executes: CREATE TABLE IF NOT EXISTS miniapp_abc12345_notes (...)

await ctx.db.run('INSERT INTO notes (text) VALUES (?)', 'Hello')
const rows = await ctx.db.all('SELECT * FROM notes')
```

---

## Panel Code

Same pattern as frontend — renders in the tray popup:

```javascript
module.exports = function MyPanel({ ctx }) {
  const { useState, useEffect, ui } = ctx
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    const off = ctx.ipc.on('status-changed', (d) => setStatus(d.status))
    ctx.ipc.send('get-status', {})
    return off
  }, [])

  return (
    <div className="p-3">
      <ui.Space size={8} className="w-full">
        <ui.Icon name="monitor" size={14} className="text-(--color-primary)" />
        <span className="text-xs text-(--color-body)">Status: {status}</span>
      </ui.Space>
    </div>
  )
}
```

---

## UI Component Library (ctx.ui)

All accessed via `ctx.ui.*`. Available components:

| Component | Key Props |
|---|---|
| `Button` | type=primary/default/text/link/dashed, size=small/middle/large, icon, loading, disabled, danger, block, onClick |
| `Input` | value, onChange, placeholder, size, disabled, type |
| `Input.TextArea` | value, onChange, placeholder, rows, disabled |
| `InputNumber` | value, onChange(val), min, max, step, size |
| `Select` | value, onChange(val), options=[{value,label}], placeholder, size |
| `Switch` | checked, onChange(bool), size=small/default |
| `Checkbox` | checked, onChange(e), children, disabled |
| `Radio` | checked, onChange(e), value, children |
| `Radio.Group` | value, onChange(e), children |
| `Tag` | color, closable, onClose, children |
| `Tooltip` | title, placement=top/bottom/left/right, children |
| `Modal` | open, title, onOk, onCancel, okText, cancelText, footer, width, children |
| `Modal.confirm` | { title, content, okText, cancelText, okButtonProps:{danger}, onOk, onCancel } |
| `message` | .success(msg), .error(msg), .warning(msg), .info(msg) |
| `Card` | title, extra, bordered, children |
| `Tabs` | activeKey, onChange(key), items=[{key,label,children}] |
| `Table` | columns=[{title,dataIndex,key,render,width,align}], dataSource, rowKey, size, bordered |
| `Alert` | message, description, type=success/info/warning/error, showIcon, closable |
| `Spin` | spinning, children |
| `Divider` | children (text inside) |
| `Space` | direction=horizontal/vertical, size (px number, or small=8/middle=16/large=24), className, children. **Use this for every row/stack.** |
| `Progress` | percent, size, status, showInfo, strokeColor |
| `Slider` | value, onChange(val), min, max, step |
| `Avatar` | src, alt, size(number), shape=circle/square, children |
| `Badge` | count, dot, color, overflowCount, showZero, children |
| `Skeleton` | active, avatar, title, paragraph, rows |
| `Empty` | description, children |
| `Collapse` | items=[{key,label,children}], defaultActiveKey |
| `Popover` | content, title, trigger=click/hover, children |
| `Dropdown` | menu={items:[{key,label,onClick,danger}]}, children |
| `Drawer` | open, title, onClose, width, placement=left/right, children |
| `Typography.Title` | level(1-5), children |
| `Typography.Text` | type=secondary/success/warning/danger, children |
| `Typography.Paragraph` | children |
| `Segmented` | options, value, onChange(val), size, block |
| `Timeline` | items=[{children,color,dot}] |

---

## Styling — compiled tokens only

**Never hardcode hex colors. Never invent Tailwind classes.**

Host Tailwind v4 shorthand (this is what is compiled):

`text-(--color-ink)`  **not**  `text-[var(--color-ink)]`

| Token | Value | Use |
|---|---|---|
| `--color-primary` | #EB9D29 | CTA, active |
| `--color-primary-soft` | #F0B454 | Hover |
| `--color-on-primary` | #101010 | Text on primary |
| `--color-canvas` | #eeefe9 | Page / desktop |
| `--color-canvas-soft` | #ffffff | Window, cards, inputs |
| `--color-hairline` | #d4d5ce | Borders |
| `--color-ink` | #1d1d1d | Primary text |
| `--color-ink-strong` | #111111 | High-emphasis text |
| `--color-body` | #5c5e58 | Secondary text |
| `--color-mute` | #8b8d86 | Captions |
| `--color-warning` | #c47d12 | Warning |
| `--color-error` | #c0392b | Error |
| `--radius-sm` | 6px | Buttons, inputs |
| `--radius-md` | 8px | Cards |

### Color classes (copy these)

```
text-(--color-ink) text-(--color-ink-strong) text-(--color-body) text-(--color-mute)
text-(--color-primary) text-(--color-error) text-(--color-warning)
bg-(--color-canvas) bg-(--color-canvas-soft) bg-(--color-primary)
bg-(--color-primary)/10 border-(--color-hairline) border-(--color-primary)/20
```

### Spacing classes that exist (scale only)

`p / px / py / pt / pb / pl / pr / m / mx / my / mt / mb / ml / mr / gap / gap-x / gap-y`
with **0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12** only.

Even then, **prefer `ui.Space`** over `gap-*`. Root padding is `p-6`. Card body is already padded.

### Use components, not hand-rolled chrome

```javascript
<ui.Card title="Title">body</ui.Card>
<ui.Button type="primary">Click</ui.Button>
<ui.Input value={text} onChange={(e) => setText(e.target.value)} placeholder="…" />
<ui.Progress percent={42} />
```

Do not rebuild buttons/inputs/cards with raw `<button>` / `<input>` unless you need something the library cannot do.

**Design rules:** cream canvas. Hairline borders. Amber only for CTAs. `ui.Card` / `rounded-md` for surfaces. No neon, no dark-theme hover borders like `hover:border-[rgba(255,255,255,0.12)]`.

---

## Complete Example: Todo App

### frontendCode

```javascript
// No glyph for a checklist, so the app draws one.
function ListTodoIcon({ size = 16, className }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3.5" y="4.5" width="5" height="5" rx="1" />
      <path d="m3.5 16 1.8 1.8L8.5 14.5M12 7h8.5M12 16h8.5" />
    </svg>
  )
}

module.exports = function TodoApp({ ctx }) {
  const { useState, useEffect, useCallback, ui } = ctx

  const [todos, setTodos] = useState([])
  const [text, setText] = useState('')

  useEffect(() => {
    const off = ctx.ipc.on('todos-loaded', (data) => setTodos(data ?? []))
    ctx.ipc.send('load-todos', {})
    return off
  }, [])

  const addTodo = useCallback(() => {
    if (!text.trim()) return
    ctx.ipc.send('add-todo', { text: text.trim() })
    setText('')
  }, [text])

  return (
    <div className="h-full overflow-y-auto p-6">
      <ui.Space direction="vertical" size={16} className="w-full max-w-xl mx-auto">
        <ui.Space size={12}>
          <div className="w-9 h-9 rounded-md bg-(--color-primary)/10 border border-(--color-primary)/20 flex items-center justify-center">
            <ListTodoIcon size={18} className="text-(--color-primary)" />
          </div>
          <h2 className="m-0 text-sm font-semibold text-(--color-ink)">Todo List</h2>
        </ui.Space>

        <ui.Space size={8} className="w-full">
          <ui.Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTodo() }} placeholder="What needs to be done?" />
          <ui.Button type="primary" icon={<ui.Icon name="add" size={14} />} onClick={addTodo}>Add</ui.Button>
        </ui.Space>

        {todos.length === 0 ? (
          <ui.Empty description="No todos yet" />
        ) : (
          <ui.Space direction="vertical" size={8} className="w-full">
            {todos.map((todo) => (
              <div key={todo.id} className="px-3 py-2.5 bg-(--color-canvas-soft) border border-(--color-hairline) rounded-md">
                <ui.Space size={12} className="w-full">
                  <button type="button" className="flex bg-transparent border-none p-0 cursor-pointer" onClick={() => ctx.ipc.send('toggle-todo', { id: todo.id })}>
                    <ui.Icon name="checkbox" size={16} className={todo.done ? 'text-(--color-primary)' : 'text-(--color-mute)'} />
                  </button>
                  <span className={'flex-1 text-sm ' + (todo.done ? 'line-through text-(--color-mute)' : 'text-(--color-ink)')}>{todo.text}</span>
                  <button type="button" aria-label="Delete" className="flex bg-transparent border-none p-0 cursor-pointer text-(--color-mute) hover:text-(--color-error)" onClick={() => ctx.ipc.send('delete-todo', { id: todo.id })}>
                    <ui.Icon name="trash" size={13} />
                  </button>
                </ui.Space>
              </div>
            ))}
          </ui.Space>
        )}
      </ui.Space>
    </div>
  )
}
```

### backendCode

```javascript
module.exports = async function setup(ctx) {
  ctx.log('Todo backend loaded')

  const getTodos = async () => {
    const raw = await ctx.storage.get('todos')
    if (!raw) return []
    try { return JSON.parse(raw) } catch (e) { return [] }
  }

  const saveTodos = async (todos) => {
    await ctx.storage.set('todos', JSON.stringify(todos))
    ctx.ipc.send('todos-loaded', todos)
  }

  ctx.ipc.on('load-todos', async () => ctx.ipc.send('todos-loaded', await getTodos()))

  ctx.ipc.on('add-todo', async (data) => {
    const todos = await getTodos()
    todos.unshift({ id: Date.now(), text: data.text, done: false, createdAt: new Date().toISOString() })
    await saveTodos(todos)
  })

  ctx.ipc.on('toggle-todo', async (data) => {
    const todos = (await getTodos()).map((t) => t.id === data.id ? { ...t, done: !t.done } : t)
    await saveTodos(todos)
  })

  ctx.ipc.on('delete-todo', async (data) => {
    await saveTodos((await getTodos()).filter((t) => t.id !== data.id))
  })

  return () => ctx.log('Todo cleanup')
}
```

### panelCode

```javascript
module.exports = function TodoPanel({ ctx }) {
  const { useState, useEffect, ui } = ctx
  const [count, setCount] = useState(0)

  useEffect(() => {
    const off = ctx.ipc.on('todos-loaded', (data) => {
      setCount((data ?? []).filter((t) => !t.done).length)
    })
    ctx.ipc.send('load-todos', {})
    return off
  }, [])

  return (
    <div className="p-3">
      <ui.Space size={8} className="w-full">
        <ui.Icon name="checkbox" size={14} className="text-(--color-primary)" />
        <span className="text-xs text-(--color-body)">Pending</span>
        <span className="ml-auto text-xs font-semibold px-1.5 py-0.5 rounded-sm border border-(--color-primary)/30 bg-(--color-primary)/10 text-(--color-primary)">{String(count)}</span>
      </ui.Space>
    </div>
  )
}
```

---

## Checklist

- [ ] Edited an existing app (never a copy), then ran `nonla check <app>` and `nonla reload <app>`
- [ ] The app has an `icon.svg` that says what it does (`--icon-file`)
- [ ] Root has `p-6` (or padded chrome). Content is not flush to the window.
- [ ] Every row/stack uses `ui.Space`. No children sitting on top of each other.
- [ ] Cards/buttons/inputs come from `ctx.ui`, not raw unpadded divs.
- [ ] Colors use `text-(--color-ink)` form, **not** `text-[var(--color-ink)]`
- [ ] No invented Tailwind (`gap-7`, `p-[18px]`, dark-theme hover borders)
- [ ] `module.exports = function` pattern
- [ ] No import/export
- [ ] **JSX syntax only** — do NOT use ctx.h() or React.createElement()
- [ ] IPC cleanup in useEffect return
- [ ] Backend is async (`await ctx.storage.*`) and returns a cleanup function
- [ ] Icons: `ui.Icon` names from the list, or your own inline `<svg>`; never `ctx.icons`
