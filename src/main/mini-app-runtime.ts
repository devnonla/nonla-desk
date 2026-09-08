import childProcess, { type ChildProcess, execSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import {
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  app as electronApp,
  ipcMain,
  Notification,
  shell,
  systemPreferences,
} from 'electron'
import { getSqlite } from './db'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MiniAppRecord {
  id: string
  name: string
  description: string
  icon: string
  category: string
  version: string
  enabled: number
  shortcut: string | null
  display_order: number
  created_at: string
  updated_at: string
}

interface MiniAppBackendInstance {
  appId: string
  process?: ChildProcess
  cleanup?: () => void | Promise<void>
  timers: Set<ReturnType<typeof setTimeout>>
  intervals: Set<ReturnType<typeof setInterval>>
}

// ─── Runtime State ───────────────────────────────────────────────────────────

const loadedApps = new Map<string, MiniAppBackendInstance>()

// ─── IPC Message Bus ─────────────────────────────────────────────────────────
// Allows backend ↔ frontend communication per mini app

const ipcListeners = new Map<string, Map<string, Set<(data: any) => void>>>()

function getAppIpcBus(appId: string) {
  if (!ipcListeners.has(appId)) {
    ipcListeners.set(appId, new Map())
  }
  const appBus = ipcListeners.get(appId)!

  return {
    on(channel: string, handler: (data: any) => void) {
      if (!appBus.has(channel)) appBus.set(channel, new Set())
      appBus.get(channel)!.add(handler)
      return () => {
        appBus.get(channel)?.delete(handler)
      }
    },
    send(channel: string, data: any) {
      // Send to renderer via IPC
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('miniapp:ipc-message', { appId, channel, data })
      }
    },
    emit(channel: string, data: any) {
      // Emit to backend listeners (called when frontend sends message)
      const handlers = appBus.get(channel)
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(data)
          } catch (e) {
            console.error(`[miniapp:${appId}] IPC handler error on "${channel}":`, e)
          }
        }
      }
    },
    cleanup() {
      appBus.clear()
      ipcListeners.delete(appId)
    },
  }
}

// ─── Config Helpers ──────────────────────────────────────────────────────────

interface ConfigFieldSchema {
  type: 'string' | 'number' | 'boolean'
  label: string
  default?: any
  required?: boolean
  description?: string
}

interface ConfigSchema {
  [key: string]: ConfigFieldSchema
}

function getAppConfigSchema(appId: string): ConfigSchema | null {
  const storage = getAppStorage(appId)
  const raw = storage.get('__config_schema__')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function getAppConfigValues(appId: string): Record<string, any> {
  const storage = getAppStorage(appId)
  const all = storage.getAll()
  const values: Record<string, any> = {}
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith('config::')) {
      const configKey = key.slice('config::'.length)
      try {
        values[configKey] = JSON.parse(value)
      } catch {
        values[configKey] = value
      }
    }
  }
  return values
}

function validateRequiredConfigs(appId: string): string[] {
  const schema = getAppConfigSchema(appId)
  if (!schema) return []
  const values = getAppConfigValues(appId)
  const missing: string[] = []
  for (const [key, field] of Object.entries(schema)) {
    if (
      field.required &&
      (values[key] === undefined || values[key] === null || values[key] === '')
    ) {
      missing.push(field.label || key)
    }
  }
  return missing
}

function saveConfigSchemaAndDefaults(appId: string, configSchema: ConfigSchema): void {
  const storage = getAppStorage(appId)
  storage.set('__config_schema__', JSON.stringify(configSchema))
  // Save default values (only if no existing value)
  for (const [key, field] of Object.entries(configSchema)) {
    if (field.default !== undefined) {
      const existing = storage.get(`config::${key}`)
      if (existing === null) {
        storage.set(`config::${key}`, JSON.stringify(field.default))
      }
    }
  }
}

// ─── Scoped Storage ──────────────────────────────────────────────────────────

function getAppStorage(appId: string) {
  const sqlite = getSqlite()

  return {
    get(key: string): string | null {
      const row = sqlite
        .prepare('SELECT value FROM mini_app_storage WHERE app_id = ? AND key = ?')
        .get(appId, key) as { value: string } | undefined
      return row?.value ?? null
    },
    set(key: string, value: string): void {
      sqlite
        .prepare(
          `INSERT INTO mini_app_storage (app_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(app_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
        )
        .run(appId, key, value)
    },
    delete(key: string): void {
      sqlite.prepare('DELETE FROM mini_app_storage WHERE app_id = ? AND key = ?').run(appId, key)
    },
    getAll(): Record<string, string> {
      const rows = sqlite
        .prepare('SELECT key, value FROM mini_app_storage WHERE app_id = ?')
        .all(appId) as { key: string; value: string }[]
      const result: Record<string, string> = {}
      for (const row of rows) {
        result[row.key] = row.value
      }
      return result
    },
    clear(): void {
      sqlite.prepare('DELETE FROM mini_app_storage WHERE app_id = ?').run(appId)
    },
  }
}

// ─── Scoped DB Helper ────────────────────────────────────────────────────────

/**
 * Auto-prefix table names in SQL with a mini app's scoped prefix.
 * This ensures mini apps can only access their own tables.
 * e.g. "CREATE TABLE notes ..." → "CREATE TABLE miniapp_abc12345_notes ..."
 */
function prefixTables(sql: string, prefix: string): string {
  // Match table names after SQL keywords (case-insensitive)
  // Handles: FROM, INTO, TABLE, UPDATE, JOIN, and IF NOT EXISTS / IF EXISTS variants
  return sql.replace(
    /\b(FROM|INTO|TABLE|UPDATE|JOIN)\s+(IF\s+(?:NOT\s+)?EXISTS\s+)?([`"]?)(\w+)\3/gi,
    (_match, keyword, ifClause, quote, tableName) => {
      // Skip if already prefixed
      if (tableName.startsWith(prefix)) {
        return `${keyword} ${ifClause || ''}${quote}${tableName}${quote}`
      }
      return `${keyword} ${ifClause || ''}${quote}${prefix}${tableName}${quote}`
    },
  )
}

// ─── Filesystem Helpers (v2) ─────────────────────────────────────────────────

export function getAppsDir(): string {
  return path.join(os.homedir(), '.nonla-desk', 'apps')
}

export function getAppCodePaths(appId: string): {
  dir: string
  frontend: string
  backend: string
  panel: string
} {
  const dir = path.join(getAppsDir(), appId)
  return {
    dir,
    frontend: path.join(dir, 'frontend', 'index.jsx'),
    backend: path.join(dir, 'backend', 'index.js'),
    panel: path.join(dir, 'panel', 'index.jsx'),
  }
}

function getSandboxRunnerPath(): string {
  // In dev mode, it's in resources/ next to the source
  // In production, it's in the app's resources directory
  const devPath = path.join(__dirname, '../../resources/sandbox-runner.js')
  const prodPath = path.join(process.resourcesPath, 'sandbox-runner.js')
  return fs.existsSync(devPath) ? devPath : prodPath
}

/**
 * Write app code files to filesystem (v2 — filesystem is source of truth).
 * Creates directory structure: ~/.nonla-desk/apps/{app-id}/backend/index.js etc.
 */
function writeAppCode(
  appId: string,
  code: { backendCode?: string; frontendCode?: string; panelCode?: string | null },
): string {
  const appDir = path.join(getAppsDir(), appId)

  if (code.backendCode !== undefined) {
    fs.mkdirSync(path.join(appDir, 'backend'), { recursive: true })
    fs.writeFileSync(path.join(appDir, 'backend', 'index.js'), code.backendCode || '', 'utf8')
  }

  if (code.frontendCode !== undefined) {
    fs.mkdirSync(path.join(appDir, 'frontend'), { recursive: true })
    fs.writeFileSync(path.join(appDir, 'frontend', 'index.jsx'), code.frontendCode || '', 'utf8')
  }

  if (code.panelCode !== undefined) {
    fs.mkdirSync(path.join(appDir, 'panel'), { recursive: true })
    fs.writeFileSync(path.join(appDir, 'panel', 'index.jsx'), code.panelCode || '', 'utf8')
  }

  return appDir
}

/**
 * Write manifest.json to app directory.
 */
function writeAppManifest(app: MiniAppRecord): void {
  const appDir = path.join(getAppsDir(), app.id)
  fs.mkdirSync(appDir, { recursive: true })

  const configSchema = getAppConfigSchema(app.id)
  const manifest: Record<string, any> = {
    name: app.name,
    version: app.version,
    icon: app.icon,
    category: app.category,
    description: app.description,
  }
  if (configSchema) {
    manifest.config = configSchema
  }
  fs.writeFileSync(path.join(appDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
}

/**
 * Read app code from filesystem (v2 — filesystem is source of truth).
 */
export function readAppCode(appId: string): {
  backendCode: string
  frontendCode: string
  panelCode: string | null
} {
  const appDir = path.join(getAppsDir(), appId)

  const readIfExists = (filePath: string): string => {
    try {
      return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
    } catch {
      return ''
    }
  }

  const backendCode = readIfExists(path.join(appDir, 'backend', 'index.js'))
  const frontendCode = readIfExists(path.join(appDir, 'frontend', 'index.jsx'))
  const panelRaw = readIfExists(path.join(appDir, 'panel', 'index.jsx'))
  const panelCode = panelRaw.trim() ? panelRaw : null

  return { backendCode, frontendCode, panelCode }
}

/**
 * Check if app has backend code on filesystem.
 */
function hasBackendCode(appId: string): boolean {
  const filePath = path.join(getAppsDir(), appId, 'backend', 'index.js')
  try {
    return fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8').trim().length > 0
  } catch {
    return false
  }
}

/**
 * Delete app directory from filesystem.
 */
function deleteAppDirectory(appId: string): void {
  const appDir = path.join(getAppsDir(), appId)
  try {
    if (fs.existsSync(appDir)) {
      fs.rmSync(appDir, { recursive: true, force: true })
    }
  } catch (e) {
    console.error(`[miniapp] Failed to delete app directory ${appDir}:`, e)
  }
}

/**
 * Install npm dependencies if package.json exists in app directory.
 */
function installDependencies(appDir: string): void {
  const pkgPath = path.join(appDir, 'package.json')
  if (!fs.existsSync(pkgPath)) return

  const nodeModulesPath = path.join(appDir, 'node_modules')
  // Skip if node_modules already exists (assume installed)
  // User can delete node_modules to force reinstall
  if (fs.existsSync(nodeModulesPath)) return

  try {
    console.log(`[miniapp] Installing dependencies in ${appDir}...`)
    execSync('npm install --production --no-audit --no-fund', {
      cwd: appDir,
      timeout: 60000, // 60s timeout
      stdio: 'pipe',
    })
    console.log(`[miniapp] Dependencies installed for ${path.basename(appDir)}`)
  } catch (e) {
    console.error(`[miniapp] npm install failed in ${appDir}:`, e)
  }
}

// ─── Backend Code Loader (v2 — Child Process) ───────────────────────────────

function loadBackendCode(app: MiniAppRecord): MiniAppBackendInstance {
  const appId = app.id
  const timerIds = new Set<ReturnType<typeof setTimeout>>()
  const intervalIds = new Set<ReturnType<typeof setInterval>>()

  // v2: Check filesystem for backend code
  if (!hasBackendCode(appId)) {
    return { appId, timers: timerIds, intervals: intervalIds }
  }

  try {
    const appDir = path.join(getAppsDir(), appId)

    // Step 2: Install dependencies if needed
    installDependencies(appDir)

    // Step 3: Fork child process
    const sandboxRunnerPath = getSandboxRunnerPath()
    const appConfig = getAppConfigValues(appId)

    const child = childProcess.fork(sandboxRunnerPath, [], {
      env: {
        ...process.env,
        APP_DIR: appDir,
        APP_ID: appId,
        APP_CONFIG: JSON.stringify(appConfig),
        APP_PATH: electronApp.getPath('userData'),
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      silent: true,
    })

    // Pipe child stdout/stderr to main console
    child.stdout?.on('data', (data: Buffer) => {
      console.log(`[miniapp:${app.name}:stdout]`, data.toString().trim())
    })
    child.stderr?.on('data', (data: Buffer) => {
      console.error(`[miniapp:${app.name}:stderr]`, data.toString().trim())
    })

    // Build scoped DB and storage for IPC proxy
    const storage = getAppStorage(appId)
    const shortId = appId.slice(0, 8)
    const tablePrefix = `miniapp_${shortId}_`
    const sqlite = getSqlite()

    // Handle messages from child process
    child.on('message', (msg: any) => {
      if (!msg || !msg.type) return

      switch (msg.type) {
        case 'log': {
          console.log(`[miniapp:${app.name}]`, ...(msg.args || []))
          for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send('miniapp:log', {
              appId,
              appName: app.name,
              timestamp: Date.now(),
              args: msg.args || [],
            })
          }
          break
        }

        case 'ipc:send': {
          // Backend → Frontend message relay
          for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send('miniapp:ipc-message', {
              appId,
              channel: msg.channel,
              data: msg.data,
            })
          }
          break
        }

        case 'storage:get': {
          try {
            const result = storage.get(msg.key)
            child.send({ type: 'response', requestId: msg.requestId, result })
          } catch (e: any) {
            child.send({ type: 'response', requestId: msg.requestId, error: e.message })
          }
          break
        }

        case 'storage:set': {
          try {
            storage.set(msg.key, msg.value)
            child.send({ type: 'response', requestId: msg.requestId, result: true })
          } catch (e: any) {
            child.send({ type: 'response', requestId: msg.requestId, error: e.message })
          }
          break
        }

        case 'storage:delete': {
          try {
            storage.delete(msg.key)
            child.send({ type: 'response', requestId: msg.requestId, result: true })
          } catch (e: any) {
            child.send({ type: 'response', requestId: msg.requestId, error: e.message })
          }
          break
        }

        case 'storage:getAll': {
          try {
            const result = storage.getAll()
            child.send({ type: 'response', requestId: msg.requestId, result })
          } catch (e: any) {
            child.send({ type: 'response', requestId: msg.requestId, error: e.message })
          }
          break
        }

        case 'db:run': {
          try {
            const safeSql = prefixTables(msg.sql, tablePrefix)
            const result = sqlite.prepare(safeSql).run(...(msg.params || []))
            child.send({ type: 'response', requestId: msg.requestId, result })
          } catch (e: any) {
            child.send({ type: 'response', requestId: msg.requestId, error: e.message })
          }
          break
        }

        case 'db:get': {
          try {
            const safeSql = prefixTables(msg.sql, tablePrefix)
            const result = sqlite.prepare(safeSql).get(...(msg.params || []))
            child.send({ type: 'response', requestId: msg.requestId, result: result ?? null })
          } catch (e: any) {
            child.send({ type: 'response', requestId: msg.requestId, error: e.message })
          }
          break
        }

        case 'db:all': {
          try {
            const safeSql = prefixTables(msg.sql, tablePrefix)
            const result = sqlite.prepare(safeSql).all(...(msg.params || []))
            child.send({ type: 'response', requestId: msg.requestId, result })
          } catch (e: any) {
            child.send({ type: 'response', requestId: msg.requestId, error: e.message })
          }
          break
        }

        case 'electron:shell': {
          try {
            const method = msg.method as keyof typeof shell
            const fn = shell[method] as (...args: any[]) => any
            const result = fn(...(msg.args || []))
            // Handle promises (e.g., shell.openExternal returns Promise)
            if (result && typeof result.then === 'function') {
              result
                .then((r: any) => {
                  child.send({ type: 'response', requestId: msg.requestId, result: r })
                })
                .catch((e: any) => {
                  child.send({ type: 'response', requestId: msg.requestId, error: e.message })
                })
            } else {
              child.send({ type: 'response', requestId: msg.requestId, result })
            }
          } catch (e: any) {
            child.send({ type: 'response', requestId: msg.requestId, error: e.message })
          }
          break
        }

        case 'electron:dialog': {
          try {
            const method = msg.method as keyof typeof dialog
            const fn = dialog[method] as (...args: any[]) => any
            const result = fn(...(msg.args || []))
            if (result && typeof result.then === 'function') {
              result
                .then((r: any) => {
                  child.send({ type: 'response', requestId: msg.requestId, result: r })
                })
                .catch((e: any) => {
                  child.send({ type: 'response', requestId: msg.requestId, error: e.message })
                })
            } else {
              child.send({ type: 'response', requestId: msg.requestId, result })
            }
          } catch (e: any) {
            child.send({ type: 'response', requestId: msg.requestId, error: e.message })
          }
          break
        }

        case 'electron:clipboard': {
          try {
            const method = msg.method as keyof typeof clipboard
            const fn = clipboard[method] as (...args: any[]) => any
            const result = fn(...(msg.args || []))
            child.send({ type: 'response', requestId: msg.requestId, result })
          } catch (e: any) {
            child.send({ type: 'response', requestId: msg.requestId, error: e.message })
          }
          break
        }

        case 'electron:notification': {
          try {
            const notif = new Notification({
              title: msg.opts?.title || '',
              body: msg.opts?.body || '',
              silent: msg.opts?.silent ?? false,
            })
            notif.show()
            child.send({ type: 'response', requestId: msg.requestId, result: true })
          } catch (e: any) {
            child.send({ type: 'response', requestId: msg.requestId, error: e.message })
          }
          break
        }

        case 'ready': {
          console.log(`[miniapp] ✅ Backend loaded (child process): ${app.name} [pid:${child.pid}]`)
          break
        }

        case 'error': {
          console.error(`[miniapp] ❌ Backend error in "${app.name}":`, msg.message)
          if (msg.stack) console.error(msg.stack)
          break
        }
      }
    })

    // Handle child process exit
    child.on('exit', (code, signal) => {
      console.log(
        `[miniapp] Child process exited for "${app.name}" (code:${code}, signal:${signal})`,
      )
      const instance = loadedApps.get(appId)
      if (instance) {
        instance.process = undefined
      }

      // Auto-disable on crash (non-zero exit, not from shutdown)
      if (code !== 0 && code !== null) {
        try {
          const sq = getSqlite()
          sq.prepare(
            "UPDATE mini_apps SET enabled = 0, updated_at = datetime('now') WHERE id = ?",
          ).run(appId)
          console.warn(
            `[miniapp] ⚠️ Auto-disabled "${app.name}" due to backend crash (exit code: ${code})`,
          )
        } catch (_disableErr) {
          // Ignore — best effort
        }
      }
    })

    child.on('error', (err) => {
      console.error(`[miniapp] Child process error for "${app.name}":`, err)
    })

    return { appId, process: child, timers: timerIds, intervals: intervalIds }
  } catch (e) {
    console.error(`[miniapp] ❌ Backend load failed for "${app.name}":`, e)
    // Auto-disable the mini app to prevent repeated crashes
    try {
      const sq = getSqlite()
      sq.prepare("UPDATE mini_apps SET enabled = 0, updated_at = datetime('now') WHERE id = ?").run(
        appId,
      )
      console.warn(`[miniapp] ⚠️ Auto-disabled "${app.name}" due to backend error`)
    } catch (_disableErr) {
      // Ignore — best effort
    }
    return { appId, timers: new Set(), intervals: new Set() }
  }
}

async function unloadBackendCode(appId: string): Promise<void> {
  const instance = loadedApps.get(appId)
  if (!instance) return

  // If child process is running, send shutdown and wait
  if (instance.process?.connected) {
    try {
      instance.process.send({ type: 'shutdown' })

      // Wait up to 5 seconds for graceful shutdown
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // Force kill if still alive
          if (instance.process && !instance.process.killed) {
            console.warn(`[miniapp] Force killing child process for ${appId}`)
            instance.process.kill('SIGKILL')
          }
          resolve()
        }, 5000)

        instance.process!.once('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    } catch (e) {
      console.error(`[miniapp] Error shutting down child process for ${appId}:`, e)
      // Force kill as fallback
      if (instance.process && !instance.process.killed) {
        instance.process.kill('SIGKILL')
      }
    }
  } else {
    // Fallback: call cleanup function (for legacy inline backends)
    try {
      await instance.cleanup?.()
    } catch (e) {
      console.error(`[miniapp] Cleanup error for ${appId}:`, e)
    }
    // Clean up all tracked timers
    for (const t of instance.timers) clearTimeout(t)
    for (const i of instance.intervals) clearInterval(i)
    instance.timers.clear()
    instance.intervals.clear()
  }

  // Clean up IPC bus
  getAppIpcBus(appId).cleanup()
  loadedApps.delete(appId)
  console.log(`[miniapp] Unloaded backend: ${appId}`)
}

// ─── DB Operations ───────────────────────────────────────────────────────────

export function listMiniApps(): MiniAppRecord[] {
  const sqlite = getSqlite()
  return sqlite
    .prepare('SELECT * FROM mini_apps ORDER BY display_order ASC, created_at ASC')
    .all() as MiniAppRecord[]
}

export function getMiniApp(id: string): MiniAppRecord | null {
  const sqlite = getSqlite()
  return (sqlite.prepare('SELECT * FROM mini_apps WHERE id = ?').get(id) as MiniAppRecord) || null
}

/** App identity is the name (case-insensitive). Used to prevent clones. */
export function findMiniAppByName(name: string): MiniAppRecord | null {
  const n = name.trim().toLowerCase()
  if (!n) return null
  const sqlite = getSqlite()
  return (
    (sqlite
      .prepare('SELECT * FROM mini_apps WHERE LOWER(TRIM(name)) = ?')
      .get(n) as MiniAppRecord) || null
  )
}

export function createMiniApp(data: {
  name: string
  description?: string
  icon?: string
  category?: string
  version?: string
  backendCode?: string
  frontendCode?: string
  panelCode?: string | null
  enabled?: boolean
}): MiniAppRecord {
  const sqlite = getSqlite()
  const id = crypto.randomBytes(8).toString('hex')
  const now = new Date().toISOString()

  // Get next display_order
  const maxOrder = sqlite
    .prepare('SELECT MAX(display_order) as max_order FROM mini_apps')
    .get() as { max_order: number | null }
  const order = (maxOrder?.max_order ?? -1) + 1

  const clash = findMiniAppByName(data.name)
  if (clash) {
    throw new Error(`An app named "${data.name}" already exists (id: ${clash.id})`)
  }

  const enabled = data.enabled !== undefined ? (data.enabled ? 1 : 0) : 0

  // v2: DB stores only metadata, no code columns
  sqlite
    .prepare(
      `INSERT INTO mini_apps (id, name, description, icon, category, version, enabled, display_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      data.name,
      data.description || '',
      data.icon || 'Box',
      data.category || 'Custom',
      data.version || '1.0.0',
      enabled,
      order,
      now,
      now,
    )

  // v2: Write code to filesystem
  writeAppCode(id, {
    backendCode: data.backendCode,
    frontendCode: data.frontendCode,
    panelCode: data.panelCode,
  })

  const app = getMiniApp(id)!

  // Write manifest
  writeAppManifest(app)

  // Load backend if enabled
  if (app.enabled) {
    const instance = loadBackendCode(app)
    loadedApps.set(id, instance)
  }

  return app
}

export async function updateMiniApp(
  id: string,
  data: {
    name?: string
    description?: string
    icon?: string
    category?: string
    version?: string
    backendCode?: string
    frontendCode?: string
    panelCode?: string | null
    enabled?: boolean
    displayOrder?: number
  },
): Promise<MiniAppRecord | null> {
  const sqlite = getSqlite()
  const existing = getMiniApp(id)
  if (!existing) return null

  // v2: Only metadata goes to DB, code goes to filesystem
  const fields: string[] = []
  const values: any[] = []

  if (data.name !== undefined) {
    const clash = findMiniAppByName(data.name)
    if (clash && clash.id !== id) {
      throw new Error(`An app named "${data.name}" already exists (id: ${clash.id})`)
    }
    fields.push('name = ?')
    values.push(data.name)
  }
  if (data.description !== undefined) {
    fields.push('description = ?')
    values.push(data.description)
  }
  if (data.icon !== undefined) {
    fields.push('icon = ?')
    values.push(data.icon)
  }
  if (data.category !== undefined) {
    fields.push('category = ?')
    values.push(data.category)
  }
  if (data.version !== undefined) {
    fields.push('version = ?')
    values.push(data.version)
  }
  if (data.enabled !== undefined) {
    fields.push('enabled = ?')
    values.push(data.enabled ? 1 : 0)
  }
  if (data.displayOrder !== undefined) {
    fields.push('display_order = ?')
    values.push(data.displayOrder)
  }

  // v2: Write code to filesystem (not DB)
  const codeChanged =
    data.backendCode !== undefined ||
    data.frontendCode !== undefined ||
    data.panelCode !== undefined
  if (codeChanged) {
    writeAppCode(id, {
      backendCode: data.backendCode,
      frontendCode: data.frontendCode,
      panelCode: data.panelCode,
    })
  }

  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')")
    values.push(id)
    sqlite.prepare(`UPDATE mini_apps SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  } else if (codeChanged) {
    // Still update timestamp if code changed
    sqlite.prepare("UPDATE mini_apps SET updated_at = datetime('now') WHERE id = ?").run(id)
  } else {
    return existing
  }

  const updated = getMiniApp(id)!

  // Update manifest if metadata changed
  if (
    data.name !== undefined ||
    data.description !== undefined ||
    data.icon !== undefined ||
    data.category !== undefined ||
    data.version !== undefined
  ) {
    writeAppManifest(updated)
  }

  // Reload backend if code changed or enabled state changed
  const backendChanged = data.backendCode !== undefined
  const enabledChanged = data.enabled !== undefined

  if (backendChanged || enabledChanged) {
    await unloadBackendCode(id)
    if (updated.enabled) {
      const instance = loadBackendCode(updated)
      loadedApps.set(id, instance)
    }
  }

  return updated
}

export async function deleteMiniApp(id: string): Promise<boolean> {
  const sqlite = getSqlite()
  await unloadBackendCode(id)

  // v2: Delete app directory from filesystem
  deleteAppDirectory(id)

  // Storage will cascade delete due to FK constraint
  const result = sqlite.prepare('DELETE FROM mini_apps WHERE id = ?').run(id)
  return result.changes > 0
}

export async function setMiniAppEnabled(
  id: string,
  enabled: boolean,
): Promise<{ app: MiniAppRecord | null; missingConfigs?: string[] }> {
  const app = getMiniApp(id)
  if (!app) return { app: null }

  if (!!app.enabled === enabled) return { app }

  if (enabled) {
    const missing = validateRequiredConfigs(id)
    if (missing.length > 0) {
      return { app: null, missingConfigs: missing }
    }
  }

  const updated = await updateMiniApp(id, { enabled })
  return { app: updated }
}

export async function toggleMiniApp(
  id: string,
): Promise<{ app: MiniAppRecord | null; missingConfigs?: string[] }> {
  const app = getMiniApp(id)
  if (!app) return { app: null }
  return setMiniAppEnabled(id, !app.enabled)
}

// ─── ZIP Import / Export ─────────────────────────────────────────────────────

async function importFromZipBuffer(buffer: Buffer): Promise<MiniAppRecord> {
  const zip = new AdmZip(buffer)
  const entries = zip.getEntries()

  // Find manifest.json
  const manifestEntry = entries.find(
    (e) => e.entryName === 'manifest.json' || e.entryName.endsWith('/manifest.json'),
  )
  if (!manifestEntry) {
    throw new Error('Invalid mini app: missing manifest.json')
  }

  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'))
  if (!manifest.name) {
    throw new Error('Invalid manifest: missing name')
  }

  // Helper to find and read a file from the zip
  const readFile = (filename: string): string => {
    const entry = entries.find(
      (e) => e.entryName === filename || e.entryName.endsWith(`/${filename}`),
    )
    return entry ? entry.getData().toString('utf8') : ''
  }

  const frontendCode = readFile('frontend.js')
  const backendCode = readFile('backend.js')
  const panelCode = readFile('panel.js')

  if (!frontendCode && !backendCode) {
    throw new Error('Invalid mini app: must have at least frontend.js or backend.js')
  }

  const existing = findMiniAppByName(manifest.name)
  if (existing) {
    const updated = await updateMiniApp(existing.id, {
      description: manifest.description || existing.description,
      icon: manifest.icon || existing.icon,
      category: manifest.category || existing.category,
      version: manifest.version || existing.version,
      backendCode,
      frontendCode,
      panelCode: panelCode || null,
    })
    if (updated) {
      if (manifest.config && typeof manifest.config === 'object') {
        saveConfigSchemaAndDefaults(existing.id, manifest.config)
      }
      ;(updated as any)._updated = true
      return updated
    }
  }

  const app = createMiniApp({
    name: manifest.name,
    description: manifest.description || '',
    icon: manifest.icon || 'Box',
    category: manifest.category || 'Custom',
    version: manifest.version || '1.0.0',
    enabled: false,
    backendCode,
    frontendCode,
    panelCode: panelCode || null,
  })

  if (manifest.config && typeof manifest.config === 'object') {
    saveConfigSchemaAndDefaults(app.id, manifest.config)
  }

  return app
}

function exportToZipBuffer(id: string): Buffer | null {
  const app = getMiniApp(id)
  if (!app) return null

  const zip = new AdmZip()

  // manifest.json
  const configSchema = getAppConfigSchema(id)
  const manifestObj: any = {
    name: app.name,
    version: app.version,
    icon: app.icon,
    category: app.category,
    description: app.description,
  }
  if (configSchema) {
    manifestObj.config = configSchema
  }
  const manifest = JSON.stringify(manifestObj, null, 2)
  zip.addFile('manifest.json', Buffer.from(manifest, 'utf8'))

  // v2: Read code from filesystem
  const code = readAppCode(id)
  if (code.frontendCode) {
    zip.addFile('frontend.js', Buffer.from(code.frontendCode, 'utf8'))
  }
  if (code.backendCode) {
    zip.addFile('backend.js', Buffer.from(code.backendCode, 'utf8'))
  }
  if (code.panelCode) {
    zip.addFile('panel.js', Buffer.from(code.panelCode, 'utf8'))
  }

  return zip.toBuffer()
}

async function importFromDirectory(dirPath: string): Promise<MiniAppRecord> {
  const manifestPath = path.join(dirPath, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Invalid mini app directory: missing manifest.json in ${dirPath}`)
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (!manifest.name) {
    throw new Error('Invalid manifest: missing name')
  }

  const readIfExists = (filename: string): string => {
    const filePath = path.join(dirPath, filename)
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
  }

  const frontendCode = readIfExists('frontend.js')
  const backendCode = readIfExists('backend.js')
  const panelCode = readIfExists('panel.js')

  if (!frontendCode && !backendCode) {
    throw new Error('Invalid mini app: must have at least frontend.js or backend.js')
  }

  const existing = findMiniAppByName(manifest.name)
  if (existing) {
    const updated = await updateMiniApp(existing.id, {
      description: manifest.description || existing.description,
      icon: manifest.icon || existing.icon,
      category: manifest.category || existing.category,
      version: manifest.version || existing.version,
      backendCode,
      frontendCode,
      panelCode: panelCode || null,
    })
    if (updated) {
      if (manifest.config && typeof manifest.config === 'object') {
        saveConfigSchemaAndDefaults(existing.id, manifest.config)
      }
      ;(updated as any)._updated = true
      return updated
    }
  }

  const app = createMiniApp({
    name: manifest.name,
    description: manifest.description || '',
    icon: manifest.icon || 'Box',
    category: manifest.category || 'Custom',
    version: manifest.version || '1.0.0',
    enabled: false,
    backendCode,
    frontendCode,
    panelCode: panelCode || null,
  })

  // Save config schema and defaults
  if (manifest.config && typeof manifest.config === 'object') {
    saveConfigSchemaAndDefaults(app.id, manifest.config)
  }

  return app
}

// ─── Load All Enabled Apps on Startup ────────────────────────────────────────

export function loadAllMiniApps(): void {
  const apps = listMiniApps()

  let loaded = 0
  for (const app of apps) {
    if (app.enabled) {
      const instance = loadBackendCode(app)
      loadedApps.set(app.id, instance)
      loaded++
    }
  }
  if (apps.length > 0) {
    console.log(`[miniapp] Loaded ${loaded}/${apps.length} mini apps`)
  }
}

export async function unloadAllMiniApps(): Promise<void> {
  const promises: Promise<void>[] = []
  for (const appId of loadedApps.keys()) {
    promises.push(unloadBackendCode(appId))
  }
  await Promise.allSettled(promises)
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

export function setupMiniAppIPC(): void {
  ipcMain.handle('miniapp:list', () => {
    return listMiniApps().map((app) => {
      // v2: Check filesystem for code presence
      const code = readAppCode(app.id)
      return {
        id: app.id,
        name: app.name,
        description: app.description,
        icon: app.icon,
        category: app.category,
        version: app.version,
        enabled: !!app.enabled,
        shortcut: app.shortcut,
        displayOrder: app.display_order,
        hasBackend: !!code.backendCode.trim(),
        hasFrontend: !!code.frontendCode.trim(),
        hasPanel: !!code.panelCode,
        createdAt: app.created_at,
        updatedAt: app.updated_at,
      }
    })
  })

  ipcMain.handle('miniapp:get', (_event, id: string) => {
    const app = getMiniApp(id)
    if (!app) return null
    // v2: Read code from filesystem
    const code = readAppCode(id)
    return {
      id: app.id,
      name: app.name,
      description: app.description,
      icon: app.icon,
      category: app.category,
      version: app.version,
      backendCode: code.backendCode,
      frontendCode: code.frontendCode,
      panelCode: code.panelCode,
      enabled: !!app.enabled,
      shortcut: app.shortcut,
      displayOrder: app.display_order,
      createdAt: app.created_at,
      updatedAt: app.updated_at,
    }
  })

  // v2: Read code from filesystem (used by renderer)
  ipcMain.handle('miniapp:read-code', (_event, id: string) => {
    try {
      return readAppCode(id)
    } catch (e: any) {
      console.error(`[miniapp] Read code error for ${id}:`, e)
      return { backendCode: '', frontendCode: '', panelCode: null }
    }
  })

  ipcMain.handle('miniapp:create', (_event, data) => {
    try {
      const app = createMiniApp(data)
      return { success: true, id: app.id }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('miniapp:update', async (_event, id: string, data) => {
    try {
      const app = await updateMiniApp(id, data)
      return { success: !!app, error: app ? undefined : 'App not found' }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('miniapp:delete', async (_event, id: string) => {
    const success = await deleteMiniApp(id)
    return { success }
  })

  ipcMain.handle('miniapp:toggle', async (_event, id: string) => {
    const result = await toggleMiniApp(id)
    if (result.missingConfigs) {
      return { success: false, missingConfigs: result.missingConfigs }
    }
    return { success: !!result.app, enabled: result.app ? !!result.app.enabled : false }
  })

  ipcMain.handle('miniapp:import-zip', async (_event, buffer: Buffer) => {
    try {
      const app = await importFromZipBuffer(Buffer.from(buffer))
      const updated = !!(app as any)._updated
      return { success: true, id: app.id, updated }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('miniapp:import-directory', async (_event, dirPath: string) => {
    try {
      const app = await importFromDirectory(dirPath)
      const updated = !!(app as any)._updated
      return { success: true, id: app.id, updated }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('miniapp:export', (_event, id: string) => {
    const buffer = exportToZipBuffer(id)
    if (!buffer) return { success: false, error: 'App not found' }
    // Return as Uint8Array for IPC transfer
    return { success: true, data: buffer }
  })

  // Frontend → Backend IPC message relay (v2: relay to child process)
  ipcMain.handle('miniapp:send-ipc', (_event, appId: string, channel: string, data: any) => {
    try {
      const instance = loadedApps.get(appId)
      if (instance?.process?.connected) {
        // v2: Send to child process via IPC
        instance.process.send({ type: 'ipc:message', channel, data })
      } else {
        // Fallback: emit on local IPC bus (for apps without child process)
        const bus = getAppIpcBus(appId)
        bus.emit(channel, data)
      }
      return { success: true }
    } catch (e: any) {
      console.error(`[miniapp] IPC relay error for ${appId}/${channel}:`, e)
      return { success: false, error: e.message }
    }
  })

  // Storage API for frontend
  ipcMain.handle('miniapp:storage-get', (_event, appId: string, key: string) => {
    try {
      return getAppStorage(appId).get(key)
    } catch (e: any) {
      console.error(`[miniapp] Storage get error for ${appId}:`, e)
      return null
    }
  })

  ipcMain.handle('miniapp:storage-set', (_event, appId: string, key: string, value: string) => {
    try {
      getAppStorage(appId).set(key, value)
      return { success: true }
    } catch (e: any) {
      console.error(`[miniapp] Storage set error for ${appId}:`, e)
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('miniapp:storage-delete', (_event, appId: string, key: string) => {
    try {
      getAppStorage(appId).delete(key)
      return { success: true }
    } catch (e: any) {
      console.error(`[miniapp] Storage delete error for ${appId}:`, e)
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('miniapp:storage-get-all', (_event, appId: string) => {
    try {
      return getAppStorage(appId).getAll()
    } catch (e: any) {
      console.error(`[miniapp] Storage getAll error for ${appId}:`, e)
      return {}
    }
  })

  // ─── Media APIs for frontend ─────────────────────────────────────────────
  ipcMain.handle('miniapp:get-desktop-sources', async (_event, opts?: any) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: opts?.types || ['screen', 'window'],
        thumbnailSize: opts?.thumbnailSize || { width: 320, height: 180 },
      })
      return sources.map((s) => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
        display_id: s.display_id,
        appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
      }))
    } catch (e: any) {
      console.error('[miniapp] desktopCapturer error:', e)
      return []
    }
  })

  ipcMain.handle('miniapp:get-media-access', (_event, mediaType: string) => {
    try {
      return systemPreferences.getMediaAccessStatus(mediaType as any)
    } catch {
      return 'unknown'
    }
  })

  ipcMain.handle('miniapp:ask-media-access', async (_event, mediaType: string) => {
    try {
      return await systemPreferences.askForMediaAccess(mediaType as any)
    } catch {
      return false
    }
  })

  // ─── Notification API for frontend ───────────────────────────────────────
  ipcMain.handle(
    'miniapp:notify',
    (_event, opts: { title: string; body?: string; silent?: boolean }) => {
      try {
        const notif = new Notification({
          title: opts.title,
          body: opts.body || '',
          silent: opts.silent ?? false,
        })
        notif.show()
        return { success: true }
      } catch (e: any) {
        console.error('[miniapp] Notification error:', e)
        return { success: false, error: e.message }
      }
    },
  )

  // ─── Config API ────────────────────────────────────────────────────────────
  ipcMain.handle('miniapp:get-config', (_event, appId: string) => {
    try {
      const schema = getAppConfigSchema(appId)
      const values = getAppConfigValues(appId)
      return { success: true, schema, values }
    } catch (e: any) {
      console.error(`[miniapp] Config get error for ${appId}:`, e)
      return { success: false, schema: null, values: {} }
    }
  })

  ipcMain.handle('miniapp:set-config', (_event, appId: string, key: string, value: any) => {
    try {
      const storage = getAppStorage(appId)
      storage.set(`config::${key}`, JSON.stringify(value))
      return { success: true }
    } catch (e: any) {
      console.error(`[miniapp] Config set error for ${appId}:`, e)
      return { success: false, error: e.message }
    }
  })
}
