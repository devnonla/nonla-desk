import fs from 'node:fs'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray,
} from 'electron'

let tray: Tray | null = null
let trayWindow: BrowserWindow | null = null
let blurTimeout: NodeJS.Timeout | null = null

ipcMain.handle('tray:is-visible', () => {
  return trayWindow ? trayWindow.isVisible() : false
})

export function hideTrayWindow(): void {
  if (blurTimeout) {
    clearTimeout(blurTimeout)
    blurTimeout = null
  }
  if (trayWindow && !trayWindow.isDestroyed()) {
    trayWindow.hide()
  }
}

ipcMain.handle('tray:hide', () => {
  hideTrayWindow()
  return { success: true }
})

const ALL_SPACES = { visibleOnFullScreen: true, skipTransformProcessType: true } as const

const MENU_BAR_SETTINGS_URL = 'x-apple.systempreferences:com.apple.ControlCenter-Settings.extension'

async function openMenuBarSettings(): Promise<void> {
  await shell.openExternal(MENU_BAR_SETTINGS_URL)
}

ipcMain.handle('tray:open-menu-bar-settings', () => openMenuBarSettings())

function isTrayOffMenuBar(): boolean {
  const bounds = tray?.getBounds()
  if (!bounds) return true
  return bounds.y < 0 || bounds.y > 80
}

async function promptIfTrayHidden(mainWindow?: BrowserWindow): Promise<void> {
  if (!isTrayOffMenuBar()) return

  const bounds = tray?.getBounds()
  console.warn(
    `[tray] status item is off the menu bar at (${bounds?.x}, ${bounds?.y}). ` +
      'macOS 26 is hiding it until the app is allowed in System Settings → Menu Bar.',
  )

  const appLabel = is.dev ? 'Electron' : 'Nonla Desk'
  const options = {
    type: 'info' as const,
    title: 'Menu bar icon is hidden',
    message: 'macOS is hiding the Nonla Desk menu bar icon.',
    detail: `Open System Settings → Menu Bar and allow ${appLabel}.`,
    buttons: ['Open Menu Bar Settings', 'Later'],
    defaultId: 0,
    cancelId: 1,
  }
  const result =
    mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options)

  if (result.response === 0) {
    await openMenuBarSettings()
  }
}

function attachToCurrentSpace(win: BrowserWindow): void {
  // Re-applying this immediately before show is what actually moves an
  // NSPanel onto the Space the user is on. Creating the window once and
  // leaving the flag set still pins it to the Space where it was born.
  win.setVisibleOnAllWorkspaces(true, ALL_SPACES)
  win.setAlwaysOnTop(true, 'pop-up-menu')
}

function createTrayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 380,
    height: 520,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    backgroundColor: '#eeefe9',
    roundedCorners: true,
    type: 'panel',
    hiddenInMissionControl: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Load renderer with tray panel flag
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}?panel=tray`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { panel: 'tray' },
    })
  }

  attachToCurrentSpace(win)

  return win
}

function positionWindowBelowTray(win: BrowserWindow, trayBounds: Electron.Rectangle): void {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { width: winWidth } = win.getBounds()

  const trayOnThisDisplay =
    trayBounds.width > 0 &&
    trayBounds.height > 0 &&
    trayBounds.x < display.bounds.x + display.bounds.width &&
    trayBounds.x + trayBounds.width > display.bounds.x

  const anchorX = trayOnThisDisplay ? trayBounds.x + trayBounds.width / 2 : cursor.x
  const y = trayOnThisDisplay
    ? Math.round(trayBounds.y + trayBounds.height + 4)
    : Math.round(display.workArea.y + 4)

  const x = Math.round(anchorX - winWidth / 2)
  const maxX = display.workArea.x + display.workArea.width - winWidth
  const clampedX = Math.max(display.workArea.x, Math.min(x, maxX))

  win.setPosition(clampedX, y, false)
}

function loadTrayIcon(): Electron.NativeImage {
  const candidates = [
    join(__dirname, '../../resources/trayIconTemplate.png'),
    join(process.resourcesPath, 'trayIconTemplate.png'),
  ]

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue
      const icon = nativeImage.createFromPath(filePath)
      if (icon.isEmpty()) continue
      icon.setTemplateImage(true)
      const { width, height } = icon.getSize()
      if (width === 22 && height === 22) return icon
      return icon.resize({ width: 22, height: 22, quality: 'best' })
    } catch {
      // try next
    }
  }

  console.error('[tray] failed to load tray icon')
  return nativeImage.createEmpty()
}

export function createTray(mainWindow?: BrowserWindow): void {
  const icon = loadTrayIcon()

  tray = new Tray(icon)
  tray.setToolTip(is.dev ? 'Nonla Desk [DEV]' : 'Nonla Desk')
  tray.setIgnoreDoubleClickEvents(true)
  setTimeout(() => {
    void promptIfTrayHidden(mainWindow)
  }, 800)

  // Create the panel window
  trayWindow = createTrayWindow()

  trayWindow.on('show', () => {
    trayWindow?.webContents.send('tray-visibility-change', true)
  })

  trayWindow.on('hide', () => {
    trayWindow?.webContents.send('tray-visibility-change', false)
  })

  // Hide panel when clicking outside, delayed to prevent click toggle race condition
  trayWindow.on('blur', () => {
    blurTimeout = setTimeout(() => {
      if (trayWindow && !trayWindow.isDestroyed()) {
        trayWindow.hide()
      }
      blurTimeout = null
    }, 100)
  })

  // Toggle on click
  tray.on('click', () => {
    if (!trayWindow || !tray) return

    if (blurTimeout) {
      clearTimeout(blurTimeout)
      blurTimeout = null
    }

    if (trayWindow.isVisible()) {
      trayWindow.hide()
    } else {
      positionWindowBelowTray(trayWindow, tray.getBounds())
      attachToCurrentSpace(trayWindow)
      trayWindow.show()
      trayWindow.focus()
      attachToCurrentSpace(trayWindow)
    }
  })

  // Right-click context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.on('right-click', () => {
    if (trayWindow?.isVisible()) {
      trayWindow.hide()
    }
    tray?.popUpContextMenu(contextMenu)
  })
}

export function destroyTray(): void {
  if (blurTimeout) {
    clearTimeout(blurTimeout)
    blurTimeout = null
  }
  if (trayWindow) {
    trayWindow.destroy()
    trayWindow = null
  }
  if (tray) {
    tray.destroy()
    tray = null
  }
}
