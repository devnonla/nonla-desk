// ─── Mini App Development Guide v3 (returned by get_miniapp_guide tool) ──────

export const MINIAPP_GUIDE = `# Nonla Desk — Mini App Development Guide (v3)

> **IMPORTANT**: Read this entire guide BEFORE writing any mini app code.
> Mini apps run inside an Electron desktop app. Code is stored on filesystem (~/.nonla-desk/apps/), evaluated at runtime.

---

## Architecture Overview

A mini app consists of up to 3 code files, each a JavaScript string:

| File | Role | Required | Runs In |
|---|---|---|---|
| \`frontendCode\` | Main UI shown when user opens the app | ✅ Yes | Renderer (browser) |
| \`backendCode\` | Background logic, API calls, data processing | ❌ Optional | Child process (Node.js) |
| \`panelCode\` | Small widget shown in the Quick Tools tray panel | ❌ Optional | Renderer (browser) |

### Communication Flow

\`\`\`
┌──────────────┐    ctx.ipc     ┌──────────────┐
│  Frontend    │ ◄────────────► │   Backend    │
│  (React UI)  │  send/on       │  (Node.js)   │
└──────────────┘                └──────────────┘
       ▲                               ▲
       │ ctx.ipc                       │ ctx.storage
       ▼                               │ ctx.db
┌──────────────┐                       ▼
│  Panel Code  │               ┌──────────────┐
│ (Tray widget)│               │   SQLite DB  │
└──────────────┘               └──────────────┘
\`\`\`

---

## MCP API (for creating/updating via MCP tools)

### ⚠️ Never clone an existing app

App **name is unique**. Calling \`create_miniapp\` with a name that already exists **fails** and returns the existing id — it does not overwrite. Use \`edit_miniapp_file\` / \`write_miniapp_file\` on that id.

### Editing rules (same as Cursor StrReplace / Write)

- **Small change** → \`edit_miniapp_file\`. \`old_string\` must match the file **byte-for-byte** (whitespace, indentation, line endings). Fails if not found. Fails if not unique unless \`replace_all: true\`. Never send a whole file through this tool.
- **New file or full rewrite** → \`write_miniapp_file\`. Prefer \`path\` over \`content\` for large JSX (avoids JSON escaping).
- **Metadata only** (name / description / icon / version) → \`update_miniapp\`. This tool no longer touches code.
- On failure: re-read with \`get_miniapp({ id, file })\` and copy the exact text.

**Preferred workflow:**

1. \`list_miniapps\` / \`get_miniapp\` to find the id (never guess).
2. Existing app, targeted change → \`edit_miniapp_file({ id, file, old_string, new_string })\`.
3. First backend/panel, or rewrite a file wholesale → \`write_miniapp_file({ id, file, content })\` or \`path\`.
4. Brand-new name only → \`create_miniapp\`. Prefer \`frontendPath\` over \`frontendCode\`.
5. After any code save → \`check_miniapp({ id })\`, then \`toggle_miniapp({ id, enabled: true })\` (or ask the user to enable it in the dashboard).
6. Code writes auto-disable the app. \`toggle_miniapp\` **sets** \`enabled\` — it does not flip. Pass \`enabled: true\` or \`false\`.

Do not create "Quick Note 2", "Password Generator copy", or a same-name clone to iterate. Edit the existing id.

\`\`\`
create_miniapp({
  name: "My App",
  frontendPath: "/absolute/path/to/frontend.jsx",  // preferred
  backendPath: "/absolute/path/to/backend.js",     // optional
  description: "...",
  icon: "🔑",
  category: "Dev Tools",
})

edit_miniapp_file({
  id: "abc123",
  file: "frontend",
  old_string: "const [count, setCount] = useState(0)",
  new_string: "const [count, setCount] = useState(1)",
})

write_miniapp_file({
  id: "abc123",
  file: "backend",
  path: "/absolute/path/to/backend.js",
})
\`\`\`

---

## ⚠️ Spacing is not optional (CRITICAL)

The host CSS resets **all** padding and margin (\`* { margin: 0; padding: 0 }\`).
The parent window has **no padding** and \`overflow: hidden\`.

Mini app JSX is **evaluated at runtime**. Tailwind only emits classes that already exist in the **host renderer**. A class you invent in mini app code (\`gap-7\`, \`p-[18px]\`, \`text-[var(--color-ink)]\`) is silently dropped. That is why agent UIs look glued together.

**Do not write a layout as a pile of Tailwind \`div\`s.** Use \`ui.Space\` for every row and column. It sets inline \`gap\`, so it always works.

### Required layout

\`\`\`javascript
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
\`\`\`

- Root **must** have \`p-6\` (24px). Full-bleed only for editors/canvases, and still pad the chrome.
- Vertical stacks: \`<ui.Space direction="vertical" size={16} className="w-full">\`
- Horizontal rows: \`<ui.Space size={12}>\` (\`size\` is px: 8 small, 16 middle, 24 large, or a number)
- Cards: \`ui.Card\` (header + 16px body). Do not fake cards with unpadded bordered divs.
- Dynamic widths (progress bars): \`style={{ width: pct + '%' }}\` — never a made-up class.

Fixed header + scrollable body:

\`\`\`javascript
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
\`\`\`

## Frontend Code

### Module Pattern

Frontend code MUST export a React component function using CommonJS:

\`\`\`javascript
module.exports = function MyApp({ ctx }) {
  const { useState, useEffect, useCallback, icons, ui } = ctx
  const { Star } = icons

  const [count, setCount] = useState(0)

  return (
    <div className="h-full overflow-y-auto p-6">
      <ui.Space size={8}>
        <Star size={16} className="text-(--color-primary)" />
        <span className="text-sm text-(--color-ink)">{count}</span>
        <ui.Button type="primary" onClick={() => setCount(count + 1)}>+1</ui.Button>
      </ui.Space>
    </div>
  )
}
\`\`\`

### The ctx Object (Frontend)

\`\`\`javascript
ctx.appId         // string — unique ID of this mini app
ctx.React         // React library

// React Hooks
ctx.useState, ctx.useEffect, ctx.useRef, ctx.useCallback, ctx.useMemo

// UI Component Library (see below)
ctx.ui            // e.g. ctx.ui.Button, ctx.ui.Input, ctx.ui.Card, ctx.ui.Modal

// Icons (all lucide-react icons)
ctx.icons         // e.g. ctx.icons.Copy, ctx.icons.Trash2, ctx.icons.Plus

// IPC (communicate with backend)
ctx.ipc.send(channel, data)     // Send message to backend
ctx.ipc.on(channel, handler)    // Listen for messages, returns cleanup fn

// Persistent Storage (key-value, async)
ctx.storage.get(key)            // Promise<string | null>
ctx.storage.set(key, value)     // Promise<{ success }>
ctx.storage.delete(key)         // Promise<{ success }>
ctx.storage.getAll()            // Promise<Record<string, string>>

// Media APIs
ctx.media.getDesktopSources(opts?)
ctx.media.getMediaAccess(type)
ctx.media.askMediaAccess(type)

// Notifications
ctx.notify(title, body?, opts?)

// Tray popup (Quick Tools panel)
ctx.tray.hide()                 // Dismiss the tray popup (e.g. before an eyedropper)
\`\`\`

### JavaScript Rules

**Code runs in eval/Function constructor context (Electron Chromium).**
**JSX is auto-transpiled by Sucrase at runtime — use JSX syntax directly.**

1. **Use \`module.exports = function\`** — no import/export
2. **Write JSX directly** — \`<div className="p-6">\` works out of the box (auto-transpiled)
3. **Modern JS OK** — \`const\`/\`let\`, arrow functions, \`async/await\`, \`?.\`, \`??\`, spread \`{...obj}\` all work fine
4. **No \`import\`/\`export\`** — this is the only real restriction
5. **Do NOT use \`ctx.h()\` or \`React.createElement()\`** — always write JSX

\`\`\`javascript
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
\`\`\`

---

## Backend Code (v2 — Child Process)

Backend runs in its own Node.js child process.
- Modern JS OK: const, let, =>, async/await, ?., ??
- Can require() npm packages
- Storage and DB are **async** (require await)

### Module Pattern

\`\`\`javascript
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
\`\`\`

### The ctx Object (Backend)

\`\`\`javascript
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

// Electron APIs (proxy, returns Promise)
ctx.shell.openExternal(url)
ctx.dialog.showOpenDialog(opts)
ctx.clipboard.readText()
ctx.clipboard.writeText(text)

// Utilities
ctx.fetch              // Native fetch
ctx.appPath            // Electron userData path
ctx.homePath           // Home directory
ctx.tmpPath            // Temp directory

// Timers (auto-cleaned on unload)
ctx.setTimeout, ctx.setInterval, ctx.clearTimeout, ctx.clearInterval

// Config (from manifest)
ctx.config             // { key: value } from user settings
\`\`\`

### Database Example

Table names are auto-prefixed with \`miniapp_{shortId}_\`:

\`\`\`javascript
// You write:
await ctx.db.run('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, text TEXT)')
// Runtime executes: CREATE TABLE IF NOT EXISTS miniapp_abc12345_notes (...)

await ctx.db.run('INSERT INTO notes (text) VALUES (?)', 'Hello')
const rows = await ctx.db.all('SELECT * FROM notes')
\`\`\`

---

## Panel Code

Same pattern as frontend — renders in the tray popup:

\`\`\`javascript
module.exports = function MyPanel({ ctx }) {
  const { useState, useEffect, icons, ui } = ctx
  const { Activity } = icons
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    const off = ctx.ipc.on('status-changed', (d) => setStatus(d.status))
    ctx.ipc.send('get-status', {})
    return off
  }, [])

  return (
    <div className="p-3">
      <ui.Space size={8} className="w-full">
        <Activity size={14} className="text-(--color-primary)" />
        <span className="text-xs text-(--color-body)">Status: {status}</span>
      </ui.Space>
    </div>
  )
}
\`\`\`

---

## UI Component Library (ctx.ui)

All accessed via \`ctx.ui.*\`. Available components:

| Component | Key Props |
|---|---|
| \`Button\` | type=primary/default/text/link/dashed, size=small/middle/large, icon, loading, disabled, danger, block, onClick |
| \`Input\` | value, onChange, placeholder, size, disabled, type |
| \`Input.TextArea\` | value, onChange, placeholder, rows, disabled |
| \`InputNumber\` | value, onChange(val), min, max, step, size |
| \`Select\` | value, onChange(val), options=[{value,label}], placeholder, size |
| \`Switch\` | checked, onChange(bool), size=small/default |
| \`Checkbox\` | checked, onChange(e), children, disabled |
| \`Radio\` | checked, onChange(e), value, children |
| \`Radio.Group\` | value, onChange(e), children |
| \`Tag\` | color, closable, onClose, children |
| \`Tooltip\` | title, placement=top/bottom/left/right, children |
| \`Modal\` | open, title, onOk, onCancel, okText, cancelText, footer, width, children |
| \`Modal.confirm\` | { title, content, okText, cancelText, okButtonProps:{danger}, onOk, onCancel } |
| \`message\` | .success(msg), .error(msg), .warning(msg), .info(msg) |
| \`Card\` | title, extra, bordered, children |
| \`Tabs\` | activeKey, onChange(key), items=[{key,label,children}] |
| \`Table\` | columns=[{title,dataIndex,key,render,width,align}], dataSource, rowKey, size, bordered |
| \`Alert\` | message, description, type=success/info/warning/error, showIcon, closable |
| \`Spin\` | spinning, children |
| \`Divider\` | children (text inside) |
| \`Space\` | direction=horizontal/vertical, size (px number, or small=8/middle=16/large=24), className, children. **Use this for every row/stack.** |
| \`Progress\` | percent, size, status, showInfo, strokeColor |
| \`Slider\` | value, onChange(val), min, max, step |
| \`Avatar\` | src, alt, size(number), shape=circle/square, children |
| \`Badge\` | count, dot, color, overflowCount, showZero, children |
| \`Skeleton\` | active, avatar, title, paragraph, rows |
| \`Empty\` | description, children |
| \`Collapse\` | items=[{key,label,children}], defaultActiveKey |
| \`Popover\` | content, title, trigger=click/hover, children |
| \`Dropdown\` | menu={items:[{key,label,onClick,danger}]}, children |
| \`Drawer\` | open, title, onClose, width, placement=left/right, children |
| \`Typography.Title\` | level(1-5), children |
| \`Typography.Text\` | type=secondary/success/warning/danger, children |
| \`Typography.Paragraph\` | children |
| \`Segmented\` | options, value, onChange(val), size, block |
| \`Timeline\` | items=[{children,color,dot}] |

---

## Styling — compiled tokens only

**Never hardcode hex colors. Never invent Tailwind classes.**

Host Tailwind v4 shorthand (this is what is compiled):

\`text-(--color-ink)\`  **not**  \`text-[var(--color-ink)]\`

| Token | Value | Use |
|---|---|---|
| \`--color-primary\` | #EB9D29 | CTA, active |
| \`--color-primary-soft\` | #F0B454 | Hover |
| \`--color-on-primary\` | #101010 | Text on primary |
| \`--color-canvas\` | #eeefe9 | Page / desktop |
| \`--color-canvas-soft\` | #ffffff | Window, cards, inputs |
| \`--color-hairline\` | #d4d5ce | Borders |
| \`--color-ink\` | #1d1d1d | Primary text |
| \`--color-ink-strong\` | #111111 | High-emphasis text |
| \`--color-body\` | #5c5e58 | Secondary text |
| \`--color-mute\` | #8b8d86 | Captions |
| \`--color-warning\` | #c47d12 | Warning |
| \`--color-error\` | #c0392b | Error |
| \`--radius-sm\` | 6px | Buttons, inputs |
| \`--radius-md\` | 8px | Cards |

### Color classes (copy these)

\`\`\`
text-(--color-ink) text-(--color-ink-strong) text-(--color-body) text-(--color-mute)
text-(--color-primary) text-(--color-error) text-(--color-warning)
bg-(--color-canvas) bg-(--color-canvas-soft) bg-(--color-primary)
bg-(--color-primary)/10 border-(--color-hairline) border-(--color-primary)/20
\`\`\`

### Spacing classes that exist (scale only)

\`p / px / py / pt / pb / pl / pr / m / mx / my / mt / mb / ml / mr / gap / gap-x / gap-y\`
with **0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12** only.

Even then, **prefer \`ui.Space\`** over \`gap-*\`. Root padding is \`p-6\`. Card body is already padded.

### Use components, not hand-rolled chrome

\`\`\`javascript
<ui.Card title="Title">body</ui.Card>
<ui.Button type="primary">Click</ui.Button>
<ui.Input value={text} onChange={(e) => setText(e.target.value)} placeholder="…" />
<ui.Progress percent={42} />
\`\`\`

Do not rebuild buttons/inputs/cards with raw \`<button>\` / \`<input>\` unless you need something the library cannot do.

**Design rules:** cream canvas. Hairline borders. Amber only for CTAs. \`ui.Card\` / \`rounded-md\` for surfaces. No neon, no dark-theme hover borders like \`hover:border-[rgba(255,255,255,0.12)]\`.

---

## Complete Example: Todo App

### frontendCode

\`\`\`javascript
module.exports = function TodoApp({ ctx }) {
  const { useState, useEffect, useCallback, icons, ui } = ctx
  const { CheckSquare, Plus, Trash2, ListTodo } = icons

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
            <ListTodo size={18} className="text-(--color-primary)" />
          </div>
          <h2 className="m-0 text-sm font-semibold text-(--color-ink)">Todo List</h2>
        </ui.Space>

        <ui.Space size={8} className="w-full">
          <ui.Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTodo() }} placeholder="What needs to be done?" />
          <ui.Button type="primary" icon={<Plus size={14} />} onClick={addTodo}>Add</ui.Button>
        </ui.Space>

        {todos.length === 0 ? (
          <ui.Empty description="No todos yet" />
        ) : (
          <ui.Space direction="vertical" size={8} className="w-full">
            {todos.map((todo) => (
              <div key={todo.id} className="px-3 py-2.5 bg-(--color-canvas-soft) border border-(--color-hairline) rounded-md">
                <ui.Space size={12} className="w-full">
                  <CheckSquare size={16} className={todo.done ? 'text-(--color-primary)' : 'text-(--color-mute)'} onClick={() => ctx.ipc.send('toggle-todo', { id: todo.id })} />
                  <span className={'flex-1 text-sm ' + (todo.done ? 'line-through text-(--color-mute)' : 'text-(--color-ink)')}>{todo.text}</span>
                  <Trash2 size={13} className="text-(--color-mute) cursor-pointer hover:text-(--color-error)" onClick={() => ctx.ipc.send('delete-todo', { id: todo.id })} />
                </ui.Space>
              </div>
            ))}
          </ui.Space>
        )}
      </ui.Space>
    </div>
  )
}
\`\`\`

### backendCode

\`\`\`javascript
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
\`\`\`

### panelCode

\`\`\`javascript
module.exports = function TodoPanel({ ctx }) {
  const { useState, useEffect, icons, ui } = ctx
  const { ListTodo } = icons
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
        <ListTodo size={14} className="text-(--color-primary)" />
        <span className="text-xs text-(--color-body)">Pending</span>
        <span className="ml-auto text-xs font-semibold px-1.5 py-0.5 rounded-sm border border-(--color-primary)/30 bg-(--color-primary)/10 text-(--color-primary)">{String(count)}</span>
      </ui.Space>
    </div>
  )
}
\`\`\`

---

## Checklist

- [ ] **Small fix?** \`edit_miniapp_file\`. **New/rewritten file?** \`write_miniapp_file\`. Metadata? \`update_miniapp\`
- [ ] Root has \`p-6\` (or padded chrome). Content is not flush to the window.
- [ ] Every row/stack uses \`ui.Space\`. No children sitting on top of each other.
- [ ] Cards/buttons/inputs come from \`ctx.ui\`, not raw unpadded divs.
- [ ] Colors use \`text-(--color-ink)\` form, **not** \`text-[var(--color-ink)]\`
- [ ] No invented Tailwind (\`gap-7\`, \`p-[18px]\`, dark-theme hover borders)
- [ ] \`module.exports = function\` pattern
- [ ] No import/export
- [ ] **JSX syntax only** — do NOT use ctx.h() or React.createElement()
- [ ] IPC cleanup in useEffect return
- [ ] Backend is async (\`await ctx.storage.*\`) and returns a cleanup function
- [ ] Icon names: valid lucide-react PascalCase names
`
