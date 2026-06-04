/**
 * Window manager — creates and controls the main BrowserWindow.
 */
import { BrowserWindow } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null

/**
 * Create the main application window.
 *
 * @param port  The port where Next.js is running.
 */
export function createMainWindow(port: number): BrowserWindow {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'HustlyTasker Desktop',
        icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            // Perf: keep timers/network at full speed when window is in
            // background — Next.js server-side transitions + cron HTTP
            // fetches must not be throttled.
            backgroundThrottling: false,
        },
    })

    mainWindow.loadURL(`http://localhost:${port}`)

    // Show window once content is ready (avoids white flash)
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show()
    })

    // Hide to tray instead of closing
    mainWindow.on('close', (event) => {
        event.preventDefault()
        mainWindow?.hide()
    })

    return mainWindow
}

/**
 * Show the main window (bring to front / restore from tray).
 */
export function showWindow(): void {
    if (!mainWindow) return

    if (mainWindow.isMinimized()) {
        mainWindow.restore()
    }

    mainWindow.show()
    mainWindow.focus()
}

/**
 * Hide the main window to system tray.
 */
export function hideWindow(): void {
    mainWindow?.hide()
}

/**
 * Get the current main window instance (may be null).
 */
export function getMainWindow(): BrowserWindow | null {
    return mainWindow
}
