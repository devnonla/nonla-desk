import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, ipcMain, nativeImage, shell } from 'electron'
import { getSqlite } from './db'
import { getMcpInfo, startMcpServer, stopMcpServer } from './mcp-server'
import { createMenu } from './menu'
import { loadAllMiniApps, setupMiniAppIPC, unloadAllMiniApps } from './mini-app-runtime'
import { createTray, destroyTray } from './tray'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 12, y: 10 },
    backgroundColor: '#e5e6e0',
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // In dev mode, override the window title to distinguish from production
  if (is.dev) {
    const devTitle = 'Nonla Desk - Development'
    mainWindow.on('page-title-updated', (e) => {
      e.preventDefault()
      mainWindow.setTitle(devTitle)
    })
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.executeJavaScript(`document.title = '${devTitle}'`)
    })
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.setName(is.dev ? 'Nonla Desk Dev' : 'Nonla Desk')

// Prevent multiple instances — if another instance is already running, quit this one
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
  process.exit(0)
}

let forceQuit = false

app.whenReady().then(() => {
  electronApp.setAppUserModelId(is.dev ? 'com.devnonla.nonla-desk-dev' : 'com.devnonla.nonla-desk')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const mainWindow = createWindow()

  // Focus existing window when a second instance tries to launch
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // Ensure dock icon is visible on macOS
  app.dock?.show()

  // Set dock icon to our custom icon (PNG works more reliably than icns with nativeImage)
  const iconPaths = [
    join(__dirname, '../../build/icon.png'),
    join(__dirname, '../../build/icon.icns'),
    join(process.resourcesPath, 'icon.png'),
  ]
  for (const p of iconPaths) {
    const icon = nativeImage.createFromPath(p)
    if (!icon.isEmpty()) {
      app.dock?.setIcon(icon)
      break
    }
  }

  // Hide window instead of quitting when clicking the X button (only in production)
  mainWindow.on('close', (e) => {
    if (!is.dev && !forceQuit) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  // Setup menu
  createMenu((tool: string) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('navigate-tool', tool)
    }
  })

  // Setup tray icon with popup panel
  createTray(mainWindow)

  // IPC handlers
  ipcMain.handle('get-app-version', () => app.getVersion())
  ipcMain.handle('mcp:info', () => getMcpInfo())
  ipcMain.handle('config:get', (_event, key: string) => {
    const row = getSqlite().prepare('SELECT value FROM configurations WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  })
  ipcMain.handle('config:set', (_event, key: string, value: string) => {
    getSqlite()
      .prepare(
        `INSERT INTO configurations (key, value, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      )
      .run(key, value)
    return { success: true }
  })

  setupMiniAppIPC()

  // Load all enabled mini apps
  loadAllMiniApps()

  // Start embedded MCP server
  startMcpServer()

  app.on('activate', () => {
    const allWindows = BrowserWindow.getAllWindows()
    if (allWindows.length === 0) {
      createWindow()
    } else if (!mainWindow.isDestroyed()) {
      // Re-show the hidden main window when clicking the dock icon
      mainWindow.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (is.dev) {
    app.quit()
  }
  // Otherwise do nothing — keep app running in background with tray
})

app.on('before-quit', async () => {
  forceQuit = true
  await unloadAllMiniApps()
  stopMcpServer()
  destroyTray()
})

// Ensure tray cleanup when process is killed (e.g., Ctrl+C during dev)
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    destroyTray()
    stopMcpServer()
    app.exit(0)
  })
}
