/**
 * Electron main process — HustlyTasker Desktop entry point.
 *
 * Lifecycle:
 *   1. Acquire single-instance lock
 *   2. On app.ready: check first-run → start Next.js → create window → tray → crons
 *   3. On window-all-closed: stay alive (tray mode)
 */
import { app, BrowserWindow, dialog } from 'electron'
import { startNextServer, stopNextServer } from './next-server'
import { createMainWindow, showWindow } from './window-manager'
import { setupTray } from './tray'
import { startCronJobs, stopCronJobs } from './cron-scheduler'
import { getStoredEnvVars, isFirstRun } from './env-manager'
import { registerIpcHandlers } from './ipc-handlers'
import { showSetupWizard } from './setup-wizard'

// ---------------------------------------------------------------------------
// Single instance lock — prevent multiple copies from running
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
    console.error('[electron] Another instance is already running. Exiting.')
    app.quit()
} else {
    app.on('second-instance', () => {
        // Focus the existing window when user tries to open a second instance
        showWindow()
    })
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.on('ready', async () => {
    // Register IPC handlers before creating any windows
    registerIpcHandlers()

    try {
        if (isFirstRun()) {
            // Show setup wizard that collects DATABASE_URL, JWT_SECRET etc.
            // This blocks until the user saves their configuration.
            console.error('[electron] First run detected — showing setup wizard')
            await showSetupWizard()
            console.error('[electron] Setup wizard completed')
        }

        const envVars = getStoredEnvVars()

        // Start Next.js standalone server
        console.error('[electron] Starting Next.js server ...')
        const port = await startNextServer(envVars)
        console.error(`[electron] Next.js ready on port ${port}`)

        // Create main browser window
        createMainWindow(port)

        // System tray
        setupTray(port)

        // Cron scheduler — use the cron secret from stored env vars
        const cronSecret = envVars.CRON_SECRET || 'local-cron'
        startCronJobs(port, cronSecret)

        console.error('[electron] Desktop app fully initialised.')
    } catch (err) {
        console.error('[electron] Fatal startup error:', err)
        dialog.showErrorBox(
            'HustlyTasker — Startup Error',
            `Failed to start the application:\n\n${err}`,
        )
        app.quit()
    }
})

// Stay alive in tray when all windows are closed
app.on('window-all-closed', () => {
    // Do NOT call app.quit() — keep running in system tray
})

// Cleanup on quit
app.on('before-quit', async () => {
    stopCronJobs()
    await stopNextServer()
})
