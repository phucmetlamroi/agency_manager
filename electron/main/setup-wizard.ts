/**
 * Setup wizard — shows a configuration window on first run.
 *
 * Loads a static HTML file (no Next.js required) that collects
 * DATABASE_URL, JWT_SECRET, and optional env vars from the user.
 * Returns a promise that resolves when the user clicks "Save & Start".
 */
import { BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { Client } from 'pg'

let wizardWindow: BrowserWindow | null = null

/**
 * Show the first-run setup wizard and wait for the user to complete it.
 *
 * @returns Promise that resolves when the wizard is done (env vars saved).
 */
export function showSetupWizard(): Promise<void> {
    return new Promise((resolve) => {
        wizardWindow = new BrowserWindow({
            width: 640,
            height: 740,
            resizable: true,
            minimizable: false,
            maximizable: false,
            title: 'HustlyTasker — Setup',
            icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
            show: false,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false, // need node for pg test connection via IPC
            },
        })

        // Load the static HTML wizard page
        const htmlPath = path.join(__dirname, '..', '..', 'assets', 'setup-wizard.html')
        wizardWindow.loadFile(htmlPath)

        wizardWindow.once('ready-to-show', () => {
            wizardWindow?.show()
        })

        // Remove menu bar (clean look)
        wizardWindow.setMenuBarVisibility(false)

        // --- IPC: wizard completion signal ---
        const onComplete = () => {
            cleanup()
            resolve()
        }

        // --- IPC: test DB connection ---
        const onTestDb = async (_event: Electron.IpcMainInvokeEvent, connectionString: string) => {
            return testDatabaseConnection(connectionString)
        }

        ipcMain.handle('wizard:complete', onComplete)
        ipcMain.handle('wizard:test-db', onTestDb)

        // If user closes the wizard window without saving, quit the app
        wizardWindow.on('closed', () => {
            wizardWindow = null
            cleanup()
            // If wizard was closed without completing, the app can't start
            // The promise never resolves, so the app stays at the ready handler
            // We quit gracefully instead.
            const { app } = require('electron')
            app.quit()
        })

        function cleanup() {
            ipcMain.removeHandler('wizard:complete')
            ipcMain.removeHandler('wizard:test-db')
            if (wizardWindow && !wizardWindow.isDestroyed()) {
                // Remove the close listener to avoid quit loop
                wizardWindow.removeAllListeners('closed')
                wizardWindow.close()
                wizardWindow = null
            }
        }
    })
}

/**
 * Test a PostgreSQL connection string by attempting to connect.
 */
async function testDatabaseConnection(
    connectionString: string,
): Promise<{ success: boolean; error?: string }> {
    const client = new Client({
        connectionString,
        connectionTimeoutMillis: 8000,
        ssl: connectionString.includes('sslmode=require')
            ? { rejectUnauthorized: false }
            : undefined,
    })

    try {
        await client.connect()
        const result = await client.query('SELECT 1 AS ok')
        await client.end()
        return { success: result.rows[0]?.ok === 1 }
    } catch (err: any) {
        try { await client.end() } catch { /* ignore */ }
        return {
            success: false,
            error: err?.message?.slice(0, 200) || 'Connection failed',
        }
    }
}
