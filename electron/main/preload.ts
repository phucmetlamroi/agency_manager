/**
 * Preload script — exposes a safe IPC bridge to the renderer (Next.js web app).
 *
 * Runs in a sandboxed context with contextIsolation: true.
 * Only the explicitly listed methods are available to window.hustly.
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('hustly', {
    // ---------------------------------------------------------------------------
    // Platform info
    // ---------------------------------------------------------------------------
    platform: process.platform,
    isDesktop: true,

    // ---------------------------------------------------------------------------
    // Environment / settings
    // ---------------------------------------------------------------------------
    getEnvVars: (): Promise<Record<string, string>> =>
        ipcRenderer.invoke('env:get-all'),

    setEnvVar: (key: string, value: string): Promise<void> =>
        ipcRenderer.invoke('env:set', key, value),

    // ---------------------------------------------------------------------------
    // Window control
    // ---------------------------------------------------------------------------
    minimize: (): void => {
        ipcRenderer.send('window:minimize')
    },
    maximize: (): void => {
        ipcRenderer.send('window:maximize')
    },
    close: (): void => {
        ipcRenderer.send('window:close')
    },

    // ---------------------------------------------------------------------------
    // App lifecycle
    // ---------------------------------------------------------------------------
    getVersion: (): Promise<string> =>
        ipcRenderer.invoke('app:version'),

    checkForUpdates: (): void => {
        ipcRenderer.send('app:check-updates')
    },

    // ---------------------------------------------------------------------------
    // Cron status
    // ---------------------------------------------------------------------------
    getCronStatus: (): Promise<string[]> =>
        ipcRenderer.invoke('cron:status'),

    // ---------------------------------------------------------------------------
    // Generic IPC passthrough (for future extensions)
    // ---------------------------------------------------------------------------
    invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
        // Whitelist channels to prevent arbitrary IPC from the renderer
        const allowedChannels = [
            'env:get-all',
            'env:set',
            'app:version',
            'cron:status',
            'wizard:complete',
            'wizard:test-db',
        ]
        if (allowedChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, ...args)
        }
        return Promise.reject(new Error(`IPC channel "${channel}" is not allowed`))
    },
})
