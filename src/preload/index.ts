import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
  getMcpInfo: (): Promise<{ port: number; url: string; listening: boolean }> =>
    ipcRenderer.invoke('mcp:info'),

  onNavigateTool: (callback: (tool: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, tool: string) => callback(tool)
    ipcRenderer.on('navigate-tool', handler)
    return () => ipcRenderer.removeListener('navigate-tool', handler)
  },

  // Mini Apps
  listMiniApps: (): Promise<any[]> => ipcRenderer.invoke('miniapp:list'),
  getMiniApp: (id: string): Promise<any> => ipcRenderer.invoke('miniapp:get', id),
  createMiniApp: (data: any): Promise<{ success: boolean; id?: string; error?: string }> =>
    ipcRenderer.invoke('miniapp:create', data),
  updateMiniApp: (id: string, data: any): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('miniapp:update', id, data),
  deleteMiniApp: (id: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('miniapp:delete', id),
  toggleMiniApp: (
    id: string,
  ): Promise<{ success: boolean; enabled: boolean; missingConfigs?: string[] }> =>
    ipcRenderer.invoke('miniapp:toggle', id),
  importMiniAppZip: (
    buffer: ArrayBuffer,
  ): Promise<{ success: boolean; id?: string; error?: string }> =>
    ipcRenderer.invoke('miniapp:import-zip', Buffer.from(buffer)),

  exportMiniApp: (id: string): Promise<{ success: boolean; data?: ArrayBuffer; error?: string }> =>
    ipcRenderer.invoke('miniapp:export', id),
  // Mini App IPC (frontend ↔ backend messaging)
  sendMiniAppIpc: (appId: string, channel: string, data: any): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('miniapp:send-ipc', appId, channel, data),
  onMiniAppIpcMessage: (callback: (msg: { appId: string; channel: string; data: any }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, msg: any) => callback(msg)
    ipcRenderer.on('miniapp:ipc-message', handler)
    return () => ipcRenderer.removeListener('miniapp:ipc-message', handler)
  },
  // Mini App Storage
  miniAppStorageGet: (appId: string, key: string): Promise<string | null> =>
    ipcRenderer.invoke('miniapp:storage-get', appId, key),
  miniAppStorageSet: (appId: string, key: string, value: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('miniapp:storage-set', appId, key, value),
  miniAppStorageDelete: (appId: string, key: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('miniapp:storage-delete', appId, key),
  miniAppStorageGetAll: (appId: string): Promise<Record<string, string>> =>
    ipcRenderer.invoke('miniapp:storage-get-all', appId),
  // Media APIs (miniapp-scoped)
  miniAppGetDesktopSources: (opts?: any): Promise<any[]> =>
    ipcRenderer.invoke('miniapp:get-desktop-sources', opts),
  getMediaAccess: (mediaType: string): Promise<string> =>
    ipcRenderer.invoke('miniapp:get-media-access', mediaType),
  askMediaAccess: (mediaType: string): Promise<boolean> =>
    ipcRenderer.invoke('miniapp:ask-media-access', mediaType),
  // Notification
  miniAppNotify: (opts: {
    title: string
    body?: string
    silent?: boolean
  }): Promise<{ success: boolean }> => ipcRenderer.invoke('miniapp:notify', opts),
  // Mini App Config
  getMiniAppConfig: (
    appId: string,
  ): Promise<{ success: boolean; schema: any; values: Record<string, any> }> =>
    ipcRenderer.invoke('miniapp:get-config', appId),
  setMiniAppConfig: (appId: string, key: string, value: any): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('miniapp:set-config', appId, key, value),
  // Mini App Logs
  onMiniAppLog: (
    callback: (msg: { appId: string; appName: string; timestamp: number; args: string[] }) => void,
  ) => {
    const handler = (_event: Electron.IpcRendererEvent, msg: any) => callback(msg)
    ipcRenderer.on('miniapp:log', handler)
    return () => ipcRenderer.removeListener('miniapp:log', handler)
  },

  // v2: Read code from filesystem
  readMiniAppCode: (
    id: string,
  ): Promise<{ backendCode: string; frontendCode: string; panelCode: string | null }> =>
    ipcRenderer.invoke('miniapp:read-code', id),

  // Config persistence
  getConfig: (key: string): Promise<string | null> => ipcRenderer.invoke('config:get', key),
  setConfig: (key: string, value: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('config:set', key, value),

  // Tray visibility
  hideTray: (): Promise<{ success: boolean }> => ipcRenderer.invoke('tray:hide'),
  openMenuBarSettings: (): Promise<void> => ipcRenderer.invoke('tray:open-menu-bar-settings'),
  onTrayVisibilityChange: (callback: (visible: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, visible: boolean) => callback(visible)
    ipcRenderer.on('tray-visibility-change', handler)
    return () => ipcRenderer.removeListener('tray-visibility-change', handler)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
