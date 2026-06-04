/**
 * IPC handlers — bridge between preload.ts and Electron main process.
 *
 * Registers ipcMain.handle() / ipcMain.on() for every channel
 * exposed by the preload contextBridge.
 */
import { ipcMain, app, BrowserWindow } from 'electron'
import { getAllEnvVars, setEnvVar } from './env-manager'
import { getCronJobNames } from './cron-scheduler'

/**
 * Register all IPC handlers.  Call once from app.ready.
 */
export function registerIpcHandlers(): void {
    // ---------------------------------------------------------------------------
    // Environment / settings
    // ---------------------------------------------------------------------------
    ipcMain.handle('env:get-all', () => {
        return getAllEnvVars()
    })

    ipcMain.handle('env:set', (_event, key: string, value: string) => {
        setEnvVar(key as any, value)
    })

    // ---------------------------------------------------------------------------
    // App lifecycle
    // ---------------------------------------------------------------------------
    ipcMain.handle('app:version', () => {
        return app.getVersion()
    })

    // ---------------------------------------------------------------------------
    // Cron status
    // ---------------------------------------------------------------------------
    ipcMain.handle('cron:status', () => {
        return getCronJobNames()
    })

    // ---------------------------------------------------------------------------
    // Window control (fire-and-forget — use ipcMain.on, not .handle)
    // ---------------------------------------------------------------------------
    ipcMain.on('window:minimize', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        win?.minimize()
    })

    ipcMain.on('window:maximize', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (win?.isMaximized()) {
            win.unmaximize()
        } else {
            win?.maximize()
        }
    })

    ipcMain.on('window:close', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        win?.hide()
    })

    ipcMain.on('app:check-updates', () => {
        // electron-updater integration placeholder
        console.error('[ipc] Check for updates triggered')
    })
}
