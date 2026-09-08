/**
 * sandbox-runner.js — Mini App Backend Child Process
 *
 * Chạy trong child process riêng per app (fork'd bởi main process).
 * Env vars: APP_DIR, APP_ID, APP_CONFIG
 *
 * IPC Protocol:
 *   Child → Main: { type: 'log'|'ipc:send'|'storage:*'|'db:*'|'electron:*', ... }
 *   Main → Child: { type: 'response'|'ipc:message'|'shutdown', ... }
 */

const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const crypto = require('node:crypto')
const childProcess = require('node:child_process')

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

// ─── IPC Request-Response ────────────────────────────────────────────────────

let requestCounter = 0
const pendingRequests = new Map()

function sendRequest(msg) {
  return new Promise((resolve, reject) => {
    const requestId = `req_${++requestCounter}_${Date.now()}`
    msg.requestId = requestId
    pendingRequests.set(requestId, { resolve, reject })
    process.send(msg)
  })
}

// ─── Timer Tracking ──────────────────────────────────────────────────────────

const trackedTimers = new Set()
const trackedIntervals = new Set()

// ─── Build ctx Object ────────────────────────────────────────────────────────

const ipcListeners = new Map()

const ctx = {
  appId: APP_ID,

  // ─── Logging ────────────────────────────────────────────────────────
  log: (...args) => {
    process.send({
      type: 'log',
      args: args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))),
    })
  },

  // ─── IPC (frontend ↔ backend) ───────────────────────────────────────
  ipc: {
    send(channel, data) {
      process.send({ type: 'ipc:send', channel, data })
    },
    on(channel, handler) {
      if (!ipcListeners.has(channel)) {
        ipcListeners.set(channel, new Set())
      }
      ipcListeners.get(channel).add(handler)
      // Return cleanup function
      return () => {
        const handlers = ipcListeners.get(channel)
        if (handlers) {
          handlers.delete(handler)
          if (handlers.size === 0) ipcListeners.delete(channel)
        }
      }
    },
  },

  // ─── Storage (async — qua IPC) ─────────────────────────────────────
  storage: {
    get: (key) => sendRequest({ type: 'storage:get', key }),
    set: (key, value) => sendRequest({ type: 'storage:set', key, value }),
    delete: (key) => sendRequest({ type: 'storage:delete', key }),
    getAll: () => sendRequest({ type: 'storage:getAll' }),
  },

  // ─── Scoped DB (async — qua IPC) ───────────────────────────────────
  db: {
    run: (sql, ...params) => sendRequest({ type: 'db:run', sql, params }),
    get: (sql, ...params) => sendRequest({ type: 'db:get', sql, params }),
    all: (sql, ...params) => sendRequest({ type: 'db:all', sql, params }),
  },

  // ─── Config ─────────────────────────────────────────────────────────
  config: APP_CONFIG,

  // ─── Node.js APIs (native — có sẵn trong child process) ─────────────
  require: require,
  fs: fs,
  path: path,
  os: os,
  crypto: crypto,
  childProcess: childProcess,

  // ─── Utilities ──────────────────────────────────────────────────────
  fetch: globalThis.fetch,
  appPath: process.env.APP_PATH || '',
  homePath: os.homedir(),
  tmpPath: os.tmpdir(),

  // ─── Electron APIs (proxy qua IPC) ─────────────────────────────────
  shell: {
    openExternal: (url) =>
      sendRequest({ type: 'electron:shell', method: 'openExternal', args: [url] }),
    openPath: (p) => sendRequest({ type: 'electron:shell', method: 'openPath', args: [p] }),
  },
  dialog: {
    showOpenDialog: (opts) =>
      sendRequest({ type: 'electron:dialog', method: 'showOpenDialog', args: [opts] }),
    showSaveDialog: (opts) =>
      sendRequest({ type: 'electron:dialog', method: 'showSaveDialog', args: [opts] }),
    showMessageBox: (opts) =>
      sendRequest({ type: 'electron:dialog', method: 'showMessageBox', args: [opts] }),
  },
  clipboard: {
    readText: () => sendRequest({ type: 'electron:clipboard', method: 'readText', args: [] }),
    writeText: (text) =>
      sendRequest({ type: 'electron:clipboard', method: 'writeText', args: [text] }),
  },
  Notification: function NotificationProxy(opts) {
    this.show = () => sendRequest({ type: 'electron:notification', opts })
  },

  // ─── Timers (tracked for cleanup) ──────────────────────────────────
  setTimeout: (fn, ms) => {
    const id = setTimeout(() => {
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

// ─── Message Handler ─────────────────────────────────────────────────────────

let cleanupFn = null

process.on('message', (msg) => {
  if (!msg || !msg.type) return

  switch (msg.type) {
    case 'response': {
      // Response to a request we sent
      const pending = pendingRequests.get(msg.requestId)
      if (pending) {
        pendingRequests.delete(msg.requestId)
        if (msg.error) {
          pending.reject(new Error(msg.error))
        } else {
          pending.resolve(msg.result)
        }
      }
      break
    }

    case 'ipc:message': {
      // Message from frontend → backend
      const handlers = ipcListeners.get(msg.channel)
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(msg.data)
          } catch (e) {
            ctx.log(`IPC handler error on "${msg.channel}":`, e?.message || String(e))
          }
        }
      }
      break
    }

    case 'shutdown': {
      shutdown()
      break
    }
  }
})

process.on('disconnect', () => {
  shutdown()
})

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

async function shutdown() {
  try {
    if (cleanupFn) {
      await cleanupFn()
    }
  } catch (e) {
    ctx.log('Cleanup error:', e?.message || String(e))
  }

  // Clear all tracked timers
  for (const id of trackedTimers) clearTimeout(id)
  for (const id of trackedIntervals) clearInterval(id)
  trackedTimers.clear()
  trackedIntervals.clear()

  // Clear pending requests
  for (const [, pending] of pendingRequests) {
    pending.reject(new Error('Process shutting down'))
  }
  pendingRequests.clear()

  process.exit(0)
}

// ─── Uncaught Exception Handler ──────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  try {
    process.send({
      type: 'error',
      message: err?.message || String(err),
      stack: err?.stack,
    })
  } catch {
    // Can't send — probably disconnected
  }
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  try {
    process.send({
      type: 'error',
      message: reason?.message || String(reason),
      stack: reason?.stack,
    })
  } catch {
    // Can't send
  }
})

// ─── Load Backend Code ───────────────────────────────────────────────────────

try {
  const backendPath = path.join(APP_DIR, 'backend', 'index.js')

  if (!fs.existsSync(backendPath)) {
    ctx.log('No backend/index.js found, running as idle process')
  } else {
    // Add app's node_modules to require search path
    const appNodeModules = path.join(APP_DIR, 'node_modules')
    if (fs.existsSync(appNodeModules)) {
      module.paths.unshift(appNodeModules)
    }

    const backend = require(backendPath)

    if (typeof backend === 'function') {
      const result = backend(ctx)

      // Support both sync and async setup
      if (result && typeof result.then === 'function') {
        result
          .then((cleanup) => {
            if (typeof cleanup === 'function') {
              cleanupFn = cleanup
            }
          })
          .catch((err) => {
            ctx.log('Backend async setup error:', err?.message || String(err))
          })
      } else if (typeof result === 'function') {
        cleanupFn = result
      }
    }

    process.send({ type: 'ready' })
  }
} catch (err) {
  try {
    process.send({
      type: 'error',
      message: err?.message || String(err),
      stack: err?.stack,
    })
  } catch {
    // Can't send
  }
  process.exit(1)
}
