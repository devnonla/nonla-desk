/**
 * sandbox-runner.cjs — one mini app backend, in its own child process.
 *
 * Spawned by the Nonla Desk app (src-tauri/src/backend.rs) with Bun, or Node
 * when Bun is missing. Env: APP_DIR, APP_ID, APP_CONFIG, APP_PATH.
 *
 * Protocol (one JSON object per line):
 *   child → app: stdout lines prefixed with "\x1e"
 *     { type: 'log' | 'ready' | 'error' | 'ipc:send' | 'storage:*' | 'db:*' | 'host:*', ... }
 *   app → child: stdin lines
 *     { type: 'response' | 'ipc:message' | 'shutdown', ... }
 * Any other stdout/stderr output is shown as a log line.
 */

const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const crypto = require('node:crypto')
const childProcess = require('node:child_process')
const { createRequire } = require('node:module')
const readline = require('node:readline')

const APP_DIR = process.env.APP_DIR
const APP_ID = process.env.APP_ID
const APP_CONFIG = (() => {
  try {
    return JSON.parse(process.env.APP_CONFIG || '{}')
  } catch {
    return {}
  }
})()

if (!APP_DIR || !APP_ID) {
  console.error('[sandbox-runner] Missing APP_DIR or APP_ID')
  process.exit(1)
}

// ─── Transport ───────────────────────────────────────────────────────────────

const rawWrite = process.stdout.write.bind(process.stdout)

function post(msg) {
  try {
    rawWrite(`\x1e${JSON.stringify(msg)}\n`)
  } catch {
    // stdout closed: the app is gone
  }
}

function formatArg(a) {
  if (typeof a === 'string') return a
  if (a instanceof Error) return a.stack || a.message
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}

// Route console output through the protocol so it reaches `nonladesk logs`.
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => post({ type: 'log', args: args.map(formatArg) })
}

let requestCounter = 0
const pendingRequests = new Map()

function sendRequest(msg) {
  return new Promise((resolve, reject) => {
    const requestId = `req_${++requestCounter}`
    pendingRequests.set(requestId, { resolve, reject })
    post({ ...msg, requestId })
  })
}

// ─── ctx ─────────────────────────────────────────────────────────────────────

const trackedTimers = new Set()
const trackedIntervals = new Set()
const ipcListeners = new Map()
const backendPath = path.join(APP_DIR, 'backend', 'index.js')

const ctx = {
  appId: APP_ID,

  log: (...args) => post({ type: 'log', args: args.map(formatArg) }),

  ipc: {
    send(channel, data) {
      post({ type: 'ipc:send', channel, data })
    },
    on(channel, handler) {
      if (!ipcListeners.has(channel)) ipcListeners.set(channel, new Set())
      ipcListeners.get(channel).add(handler)
      return () => {
        const handlers = ipcListeners.get(channel)
        if (!handlers) return
        handlers.delete(handler)
        if (handlers.size === 0) ipcListeners.delete(channel)
      }
    },
  },

  storage: {
    get: (key) => sendRequest({ type: 'storage:get', key }),
    set: (key, value) => sendRequest({ type: 'storage:set', key, value }),
    delete: (key) => sendRequest({ type: 'storage:delete', key }),
    getAll: () => sendRequest({ type: 'storage:getAll' }),
  },

  // Table names are prefixed with miniapp_<id8>_ by the app.
  db: {
    run: (sql, ...params) => sendRequest({ type: 'db:run', sql, params }),
    get: (sql, ...params) => sendRequest({ type: 'db:get', sql, params }),
    all: (sql, ...params) => sendRequest({ type: 'db:all', sql, params }),
  },

  config: APP_CONFIG,

  // Resolves packages from the app's own node_modules.
  require: createRequire(backendPath),
  fs,
  path,
  os,
  crypto,
  childProcess,

  fetch: globalThis.fetch,
  appPath: process.env.APP_PATH || '',
  homePath: os.homedir(),
  tmpPath: os.tmpdir(),

  shell: {
    openExternal: (url) => sendRequest({ type: 'host:shell', method: 'openExternal', args: [url] }),
    openPath: (p) => sendRequest({ type: 'host:shell', method: 'openPath', args: [p] }),
    showItemInFolder: (p) =>
      sendRequest({ type: 'host:shell', method: 'showItemInFolder', args: [p] }),
  },
  dialog: {
    showOpenDialog: (opts) =>
      sendRequest({ type: 'host:dialog', method: 'showOpenDialog', args: [opts || {}] }),
    showSaveDialog: (opts) =>
      sendRequest({ type: 'host:dialog', method: 'showSaveDialog', args: [opts || {}] }),
    showMessageBox: (opts) =>
      sendRequest({ type: 'host:dialog', method: 'showMessageBox', args: [opts || {}] }),
  },
  clipboard: {
    readText: () => sendRequest({ type: 'host:clipboard', method: 'readText', args: [] }),
    writeText: (text) => sendRequest({ type: 'host:clipboard', method: 'writeText', args: [text] }),
  },
  Notification: function NotificationProxy(opts) {
    this.show = () => sendRequest({ type: 'host:notification', opts })
  },

  setTimeout: (fn, ms) => {
    const id = setTimeout(() => {
      trackedTimers.delete(id)
      try {
        fn()
      } catch (e) {
        ctx.log('Timer error:', e?.message || String(e))
      }
    }, ms)
    trackedTimers.add(id)
    return id
  },
  setInterval: (fn, ms) => {
    const id = setInterval(() => {
      try {
        fn()
      } catch (e) {
        ctx.log('Interval error:', e?.message || String(e))
      }
    }, ms)
    trackedIntervals.add(id)
    return id
  },
  clearTimeout: (id) => {
    clearTimeout(id)
    trackedTimers.delete(id)
  },
  clearInterval: (id) => {
    clearInterval(id)
    trackedIntervals.delete(id)
  },
}

// ─── Incoming messages ───────────────────────────────────────────────────────

let cleanupFn = null
let shuttingDown = false

function handleMessage(msg) {
  if (!msg || !msg.type) return
  switch (msg.type) {
    case 'response': {
      const pending = pendingRequests.get(msg.requestId)
      if (!pending) return
      pendingRequests.delete(msg.requestId)
      if (msg.error) pending.reject(new Error(msg.error))
      else pending.resolve(msg.result)
      return
    }
    case 'ipc:message': {
      const handlers = ipcListeners.get(msg.channel)
      if (!handlers) return
      for (const handler of handlers) {
        try {
          const r = handler(msg.data)
          if (r && typeof r.catch === 'function') {
            r.catch((e) =>
              ctx.log(`IPC handler error on "${msg.channel}":`, e?.message || String(e)),
            )
          }
        } catch (e) {
          ctx.log(`IPC handler error on "${msg.channel}":`, e?.message || String(e))
        }
      }
      return
    }
    case 'shutdown':
      shutdown()
      return
  }
}

const input = readline.createInterface({ input: process.stdin })
input.on('line', (line) => {
  if (!line.trim()) return
  try {
    handleMessage(JSON.parse(line))
  } catch (e) {
    ctx.log('Bad message from host:', e?.message || String(e))
  }
})
// stdin closes when the app exits or kills us.
input.on('close', () => shutdown())

async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  try {
    if (cleanupFn) await cleanupFn()
  } catch (e) {
    ctx.log('Cleanup error:', e?.message || String(e))
  }
  for (const id of trackedTimers) clearTimeout(id)
  for (const id of trackedIntervals) clearInterval(id)
  for (const [, pending] of pendingRequests) pending.reject(new Error('Process shutting down'))
  pendingRequests.clear()
  process.exit(0)
}

process.on('uncaughtException', (err) => {
  post({ type: 'error', message: err?.message || String(err), stack: err?.stack })
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  post({ type: 'error', message: reason?.message || String(reason), stack: reason?.stack })
})

// ─── Load the backend ────────────────────────────────────────────────────────

try {
  if (!fs.existsSync(backendPath)) {
    ctx.log('No backend/index.js found, running as idle process')
  } else {
    const backend = require(backendPath)
    const setup = typeof backend === 'function' ? backend : backend?.default
    if (typeof setup === 'function') {
      const result = setup(ctx)
      if (result && typeof result.then === 'function') {
        result
          .then((cleanup) => {
            if (typeof cleanup === 'function') cleanupFn = cleanup
          })
          .catch((err) => {
            ctx.log('Backend async setup error:', err?.message || String(err))
          })
      } else if (typeof result === 'function') {
        cleanupFn = result
      }
    }
    post({ type: 'ready' })
  }
} catch (err) {
  post({ type: 'error', message: err?.message || String(err), stack: err?.stack })
  process.exit(1)
}
