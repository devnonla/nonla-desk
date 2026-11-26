# Nonla Desk — Mini App Development Guide

> Read this before writing mini app code. Mini apps run inside the Nonla Desk desktop app (Tauri). Code is stored on the filesystem (`~/.nonla-desk/apps/`) and evaluated at runtime.
> Related: `nonladesk guide icon` (drawing the icon). Sharing and installing other people's apps: the nonla-market skill.

---

## Architecture Overview

A mini app has up to 3 code files plus an icon:

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

## Managing apps with the `nonladesk` CLI

Nonla Desk must be running (the CLI starts it if it is installed). Every command takes an app **id or name**. Add `--json` before the command for machine-readable output.

### Never clone an existing app

App **name and id are unique**. `nonladesk create` with a name that already exists **fails** and prints the existing id. Edit that app instead. Do not create "Quick Note 2" or a copy to iterate.

### Workflow

1. `nonladesk list` to find the app. Never guess ids.
2. New app: write the files anywhere, then
   `nonladesk create "My App" --frontend ./frontend.jsx [--backend ./backend.js] [--panel ./panel.jsx] --icon-file ./icon.svg --category "Dev Tools" --description "..."`.
   Without `--frontend`, a starter component is written for you.
3. Existing app: edit its files **in place**. `nonladesk path <app>` prints the directory:
   `frontend/index.jsx`, `backend/index.js`, `panel/index.jsx`, `icon.svg`, `manifest.json`.
   Or replace one file: `nonladesk write <app> frontend ./file.jsx` (or `-` for stdin).
4. After any change: `nonladesk check <app>` (transpiles JSX with the runtime's own compiler and checks syntax and `module.exports`).
5. Apply: `nonladesk reload <app>` re-reads the files, restarts the backend, and refreshes open windows. `nonladesk write` reloads by itself.
6. New apps start **disabled**. `nonladesk enable <app>` turns one on (fails if required config is missing).
7. Backend problems: `nonladesk logs <app>` prints recent `ctx.log`, stdout/stderr, and crashes. A backend that exits with an error is disabled automatically.
8. `nonladesk open <app>` shows the app in Nonla Desk so the user can see it.

Other commands: `nonladesk get <app> [--file frontend|backend|panel]`, `nonladesk update <app> --name/--description/--icon-file/--category/--version` (metadata only), `nonladesk disable <app>`, `nonladesk delete <app> --yes`, `nonladesk install <app> [--open]` (own macOS app in ~/Applications/Nonla Apps, own Dock icon and window; edits made with the CLI show up in it live), `nonladesk uninstall <app>`, `nonladesk status`, `nonladesk guide [develop|icon|publish|review]`.

```bash
nonladesk create "Password Generator" --frontend /tmp/pw/frontend.jsx --backend /tmp/pw/backend.js --icon-file /tmp/pw/icon.svg --category "Dev Tools"
nonladesk check "Password Generator"
nonladesk enable "Password Generator"
# later, after editing ~/.nonla-desk/apps/<id>/frontend/index.jsx:
nonladesk check "Password Generator" && nonladesk reload "Password Generator"
```

Every app has a unique **id** (lowercase letters, digits, hyphens; e.g. `color-picker`), made from its name on `create` or set with `--id`. It never changes; the name can. Commands accept the id, the name or the internal folder id. Raise `version` (`nonladesk update <app> --version 1.1.0`) whenever the code changes, so a shared copy is recognised as newer (sharing: the nonla-market skill).

Every app also needs an icon: draw it as described in `nonladesk guide icon` and pass `--icon-file icon.svg`.

---

## Frontend Code

### Module Pattern

Frontend code MUST export a React component function, using CommonJS or `export default`:

```javascript
module.exports = function MyApp({ ctx }) {
  const { useState } = ctx
  const [count, setCount] = useState(0)

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <button type="button" onClick={() => setCount(count + 1)}>Clicked {count} times</button>
    </div>
  )
}
```

### Layout and styling

The window gives your component the whole area with **no padding** and `overflow: hidden`, and the host CSS resets every margin and padding. So:

- Give the root padding (24px) and make it scroll: `style={{ height: '100%', overflowY: 'auto', padding: 24 }}`.
- Style with inline `style`, or with the CSS of the library you import. Tailwind classes only exist if they are already in the desktop's safelist (the app's code is not scanned), so do not rely on them.
- Use the UI library you like: antd, Mantine, plain HTML… (see "Libraries"). The desktop does not prefer one.

### The ctx Object (Frontend)

```javascript
ctx.appId         // string — unique ID of this mini app
ctx.React         // React library

// React Hooks
ctx.useState, ctx.useEffect, ctx.useRef, ctx.useCallback, ctx.useMemo

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

### Libraries

A frontend or panel can `import` any npm package or https URL; the desktop fetches it from the network (esm.sh) before the app runs, so the app needs a connection the first time (the webview caches it after). Use it for components, dates, charts, anything you would use in a web app:

```jsx
import { Button, DatePicker } from 'antd'
import 'antd/dist/reset.css'          // CSS files become a <link>
import dayjs from 'dayjs@1'           // pin a version with @
import confetti from 'https://esm.sh/canvas-confetti'

export default function MyApp({ ctx }) {
  return <Button type="primary" onClick={() => confetti()}>{dayjs().format('YYYY-MM-DD')}</Button>
}
```

- `react`, `react-dom` and the JSX runtime are the desktop's own copy, so a library's hooks work with `ctx.useState`. Do not import a second React.
- A bare name like `antd` loads `https://esm.sh/antd` as one bundled file with React shared. Add your own query (`antd?bundle=false`) to change that.
- The first run fetches the library and pins the exact version it resolved (`antd` → `antd@6.7.2`); later runs reuse that file from the webview cache and do not go back to the network, even offline. A new version only arrives when you ask for one (`antd@7`). Write the version yourself (`antd@6.7.2`) to make an app independent of what was pinned on this machine.
- Relative imports (`./x`) are not supported: keep the app in one file.
- For a library's own look use its CSS; for your own layout use inline `style` (Tailwind classes only work if they are in the desktop's safelist).
- `nonladesk check` does not fetch libraries: open the app (`nonladesk open <app>`) to see load errors.

### Icons inside the app

There is no icon pack (`ctx.icons` fails with an error). Draw icons as inline `<svg>` in your file, 24×24 viewBox, `stroke="currentColor"`, round caps:

```javascript
function KeyIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8.5-8.5M16 7l2.5 2.5" />
    </svg>
  )
}
```

Helpers like `KeyIcon` go above `module.exports` (JSX works there too). Or take icons from a library you import. (This is separate from the app's own `icon.svg`, see `nonladesk guide icon`.)

### JavaScript Rules

**Code runs in a Function constructor inside the app's WebKit webview (Safari engine).**
**JSX is auto-transpiled by Sucrase at runtime — use JSX syntax directly.**

1. **Export the component** with `module.exports = function MyApp({ ctx }) {…}` or `export default function MyApp({ ctx }) {…}`
2. **Write JSX directly** — `<div className="p-6">` works out of the box (auto-transpiled)
3. **Modern JS OK** — `const`/`let`, arrow functions, `async/await`, `?.`, `??`, spread `{...obj}` all work fine
4. **`import` any library you like** (see "Libraries" above). Backends stay CommonJS (`require`)
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

// ❌ WRONG — a second React: use ctx.useState / the shared 'react' import, never your own copy
import React from 'https://esm.sh/react'

// ❌ WRONG — do NOT use ctx.h() or React.createElement()
return ctx.h('div', { className: 'p-6' }, items.length, ' items')
```

---

## Backend Code (child process)

Backend runs in its own child process under Bun (Node.js if Bun is missing). Node built-ins work in both.
- `console.log` output and crashes show in `nonladesk logs <app>`
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

Same pattern as the frontend, rendered in the tray popup (small: about 300px wide):

```javascript
module.exports = function MyPanel({ ctx }) {
  const { useState, useEffect } = ctx
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    const off = ctx.ipc.on('status-changed', (d) => setStatus(d.status))
    ctx.ipc.send('get-status', {})
    return off
  }, [])

  return (
    <div style={{ padding: 12, fontSize: 12, fontFamily: 'system-ui, sans-serif' }}>
      Status: {status}
    </div>
  )
}
```

---

## Complete Example: Todo App

### frontend/index.jsx

```javascript
module.exports = function TodoApp({ ctx }) {
  const { useState, useEffect, useCallback } = ctx
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
    <div style={{ height: '100%', overflowY: 'auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>Todo List</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            style={{ flex: 1, padding: '6px 10px' }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addTodo() }}
            placeholder="What needs to be done?"
          />
          <button type="button" onClick={addTodo}>Add</button>
        </div>
        {todos.length === 0 ? (
          <p style={{ color: '#8b8d86' }}>No todos yet</p>
        ) : (
          todos.map((todo) => (
            <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #d4d5ce' }}>
              <input type="checkbox" checked={todo.done} onChange={() => ctx.ipc.send('toggle-todo', { id: todo.id })} />
              <span style={{ flex: 1, textDecoration: todo.done ? 'line-through' : 'none', color: todo.done ? '#8b8d86' : '#1d1d1d' }}>{todo.text}</span>
              <button type="button" aria-label="Delete" onClick={() => ctx.ipc.send('delete-todo', { id: todo.id })}>Delete</button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
```

### backend/index.js

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

### panel/index.jsx

```javascript
module.exports = function TodoPanel({ ctx }) {
  const { useState, useEffect } = ctx
  const [count, setCount] = useState(0)

  useEffect(() => {
    const off = ctx.ipc.on('todos-loaded', (data) => {
      setCount((data ?? []).filter((t) => !t.done).length)
    })
    ctx.ipc.send('load-todos', {})
    return off
  }, [])

  return (
    <div style={{ padding: 12, display: 'flex', gap: 8, fontSize: 12, fontFamily: 'system-ui, sans-serif' }}>
      <span>Pending</span>
      <strong style={{ marginLeft: 'auto' }}>{count}</strong>
    </div>
  )
}
```

---

## Checklist

- [ ] Edited an existing app (never a copy), then ran `nonladesk check <app>` and `nonladesk reload <app>`
- [ ] The app has an `icon.svg` that says what it does (`--icon-file`, see `nonladesk guide icon`)
- [ ] `version` raised if the code changed
- [ ] The root of the UI has padding and scrolls; content is not flush to the window
- [ ] The component is exported with `module.exports = function` or `export default function`
- [ ] Libraries come from `import` (npm name or https URL); the backend uses `require`, never `import`
- [ ] **JSX syntax only**: do NOT use `ctx.h()` or `React.createElement()`
- [ ] IPC cleanup in the `useEffect` return
- [ ] Backend is async (`await ctx.storage.*`) and returns a cleanup function
- [ ] Icons are inline `<svg>` or from a library; never `ctx.icons`
