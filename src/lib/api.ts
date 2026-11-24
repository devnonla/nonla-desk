/**
 * Bridge to the Rust core (src-tauri/src/commands.rs). Results keep the
 * `{ success, error }` shapes the components already expect.
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export type MiniAppChangeAction = 'created' | 'updated' | 'deleted'

export interface MiniAppChangeEvent {
  action: MiniAppChangeAction
  id: string
  enabled?: boolean
  codeChanged?: boolean
  metadataChanged?: boolean
}

export interface MiniAppLogEvent {
  appId: string
  appName: string
  timestamp: number
  stream: string
  args: string[]
}

export interface CheckRequest {
  requestId: string
  files: { frontend?: string; backend?: string; panel?: string }
}

type Result<T = object> = ({ success: true } & T) | { success: false; error: string }

function message(e: unknown): string {
  return typeof e === 'string' ? e : e instanceof Error ? e.message : String(e)
}

async function attempt<T extends object>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { success: true, ...(await run()) }
  } catch (e) {
    return { success: false, error: message(e) }
  }
}

/** Subscribe to a Rust event. Returns a synchronous cleanup for useEffect. */
function on<T>(event: string, callback: (payload: T) => void): () => void {
  let unlisten: (() => void) | undefined
  let disposed = false
  void listen<T>(event, (e) => callback(e.payload)).then((fn) => {
    if (disposed) fn()
    else unlisten = fn
  })
  return () => {
    disposed = true
    unlisten?.()
  }
}

/**
 * One Tauri listener per busy event, registered when this module loads, fanned
 * out to subscribers in JS. Subscribing is synchronous, so a mini app that calls
 * `ctx.ipc.on()` then `ctx.ipc.send()` never misses the first reply, and N
 * components cost one bridge listener instead of N.
 */
function bus<T>(event: string) {
  const subscribers = new Set<(payload: T) => void>()
  void listen<T>(event, (e) => {
    for (const fn of subscribers) fn(e.payload)
  })
  return (callback: (payload: T) => void) => {
    subscribers.add(callback)
    return () => {
      subscribers.delete(callback)
    }
  }
}

type IpcMessage = { appId: string; channel: string; data: any }

/** Backend → frontend messages, routed by app and channel. */
const ipcHandlers = new Map<string, Set<(data: any) => void>>()
const ipcKey = (appId: string, channel: string) => `${appId}\u0000${channel}`
void listen<IpcMessage>('miniapp:ipc-message', (e) => {
  const handlers = ipcHandlers.get(ipcKey(e.payload.appId, e.payload.channel))
  if (handlers) for (const fn of handlers) fn(e.payload.data)
})

const onChanged = bus<MiniAppChangeEvent>('miniapp:changed')
const onLog = bus<MiniAppLogEvent>('miniapp:log')

export const windowLabel = (): string => getCurrentWindow().label

export const api = {
  getAppVersion: () => invoke<string>('app_version'),

  /** Routes from the menu bar, tray and `nonla open`, including any sent before the UI loaded. */
  onNavigateTool: (callback: (tool: string) => void) => {
    let unlisten: (() => void) | undefined
    let disposed = false
    void listen<string>('navigate-tool', (e) => callback(e.payload)).then(async (fn) => {
      if (disposed) {
        fn()
        return
      }
      unlisten = fn
      for (const route of await invoke<string[]>('ui_ready')) callback(route)
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  },
  openMain: (route?: string) => invoke<void>('open_main', { route }),

  // Mini apps
  listMiniApps: () => invoke<any[]>('list_mini_apps'),
  getMiniApp: (id: string) => invoke<any | null>('get_mini_app', { id }),
  createMiniApp: (data: Record<string, unknown>) =>
    attempt(() => invoke<{ id: string }>('create_mini_app', { data: normalize(data) })),
  updateMiniApp: (id: string, data: Record<string, unknown>) =>
    attempt(async () => {
      await invoke('update_mini_app', { id, data: normalize(data) })
      return {}
    }),
  deleteMiniApp: (id: string) =>
    attempt(async () => ({ deleted: await invoke<boolean>('delete_mini_app', { id }) })),
  toggleMiniApp: async (id: string) => {
    try {
      const r = await invoke<{ enabled: boolean; missingConfigs?: string[] }>('toggle_mini_app', {
        id,
      })
      if (r.missingConfigs?.length) {
        return { success: false, enabled: false, missingConfigs: r.missingConfigs }
      }
      return { success: true, enabled: r.enabled }
    } catch (e) {
      return { success: false, enabled: false, error: message(e) }
    }
  },
  importMiniAppZip: (buffer: ArrayBuffer) =>
    attempt(() =>
      invoke<{ id: string; updated: boolean }>('import_mini_app_zip', {
        data: Array.from(new Uint8Array(buffer)),
      }),
    ),
  /** Shows a save dialog. `path` is null when the user cancels. */
  exportMiniApp: (id: string) =>
    attempt(async () => ({ path: await invoke<string | null>('export_mini_app', { id }) })),

  // Frontend ↔ backend messaging
  sendMiniAppIpc: (appId: string, channel: string, data: unknown) =>
    invoke<boolean>('send_mini_app_ipc', { appId, channel, data: data ?? null }),
  /** Subscribe to one app's channel. Returns a synchronous unsubscribe. */
  onMiniAppIpc: (appId: string, channel: string, handler: (data: any) => void) => {
    const key = ipcKey(appId, channel)
    let set = ipcHandlers.get(key)
    if (!set) ipcHandlers.set(key, (set = new Set()))
    set.add(handler)
    return () => {
      set.delete(handler)
      if (set.size === 0) ipcHandlers.delete(key)
    }
  },

  // Scoped storage
  miniAppStorageGet: (appId: string, key: string) =>
    invoke<string | null>('storage_get', { appId, key }),
  miniAppStorageSet: (appId: string, key: string, value: string) =>
    attempt(async () => {
      await invoke('storage_set', { appId, key, value: String(value) })
      return {}
    }),
  miniAppStorageDelete: (appId: string, key: string) =>
    attempt(async () => {
      await invoke('storage_delete', { appId, key })
      return {}
    }),
  miniAppStorageGetAll: (appId: string) =>
    invoke<Record<string, string>>('storage_get_all', { appId }),

  // Media. WKWebView asks for camera/mic itself on getUserMedia; there is no
  // desktop capturer, so screen sources are empty.
  miniAppGetDesktopSources: async (_opts?: unknown): Promise<any[]> => [],
  getMediaAccess: async (_mediaType: string) => 'granted',
  askMediaAccess: async (_mediaType: string) => true,

  miniAppNotify: (opts: { title: string; body?: string; silent?: boolean }) =>
    attempt(async () => {
      await invoke('notify', { title: opts.title, body: opts.body })
      return {}
    }),

  // Config declared in the manifest
  getMiniAppConfig: (appId: string) =>
    attempt(() =>
      invoke<{ schema: any; values: Record<string, any> }>('get_mini_app_config', { appId }),
    ),
  setMiniAppConfig: (appId: string, key: string, value: unknown) =>
    attempt(async () => {
      await invoke('set_mini_app_config', { appId, key, value: value ?? null })
      return {}
    }),

  onMiniAppLog: onLog,
  getMiniAppLogs: (appId: string) =>
    invoke<{ timestamp: number; stream: string; text: string }[]>('mini_app_logs', { appId }),
  onMiniAppChanged: onChanged,
  onRuntimeMissing: (callback: (event: { appId: string }) => void) =>
    on('runtime:missing', callback),

  // `nonla check` round trip (see src-tauri/src/check.rs)
  onCheckRequest: (callback: (req: CheckRequest) => void) => on('check:request', callback),
  sendCheckResult: (requestId: string, result: unknown) =>
    invoke<void>('check_result', { requestId, result }),

  // In-app updates (src-tauri/src/updater.rs). `text: null` hides the notice.
  onUpdateProgress: (callback: (event: { text: string | null; percent: number }) => void) =>
    on('update:progress', callback),

  // Tray panel
  hideTray: () => invoke<void>('hide_tray'),
  onTrayVisibilityChange: (callback: (visible: boolean) => void) =>
    on<boolean>('tray-visibility-change', callback),
}

/** Rust expects strings: `null` panel code means "clear". */
function normalize(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue
    out[k] = v === null && k.endsWith('Code') ? '' : v
  }
  return out
}

export type DesktopAPI = typeof api
