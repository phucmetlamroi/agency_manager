/**
 * System tray — icon + context menu for background operation.
 */
import { Tray, Menu, nativeImage, app, shell } from 'electron'
import path from 'path'
import { showWindow } from './window-manager'
import { getCronJobNames } from './cron-scheduler'

let tray: Tray | null = null

/**
 * Set up the system tray icon and context menu.
 *
 * @param port  Port the local Next.js server is running on.
 */
export function setupTray(port: number): void {
    const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png')

    // Fallback to an empty 16x16 icon if file missing (dev mode)
    let icon: Electron.NativeImage
    try {
        icon = nativeImage.createFromPath(iconPath)
        if (icon.isEmpty()) {
            icon = nativeImage.createEmpty()
        }
    } catch {
        icon = nativeImage.createEmpty()
    }

    tray = new Tray(icon)
    tray.setToolTip('HustlyTasker Desktop')

    const buildMenu = () => {
        const cronNames = getCronJobNames()
        const cronSubmenu: Electron.MenuItemConstructorOptions[] = cronNames.map(
            (name) => ({
                label: name,
                enabled: false, // display-only status items
            }),
        )

        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Open Dashboard',
                click: () => {
                    showWindow()
                },
            },
            {
                label: 'Open Admin',
                click: () => {
                    shell.openExternal(`http://localhost:${port}/admin`)
                },
            },
            { type: 'separator' },
            {
                label: 'Cron Status',
                submenu: cronSubmenu.length > 0
                    ? cronSubmenu
                    : [{ label: '(no jobs)', enabled: false }],
            },
            {
                label: 'MCP Status',
                click: () => {
                    shell.openExternal(`http://localhost:${port}/admin/mcp`)
                },
            },
            { type: 'separator' },
            {
                label: 'Settings',
                click: () => {
                    // TODO: open dedicated settings window
                    showWindow()
                },
            },
            {
                label: 'Check for Updates',
                click: () => {
                    // electron-updater integration placeholder
                    console.error('[tray] Check for updates triggered')
                },
            },
            { type: 'separator' },
            {
                label: 'Quit',
                click: () => {
                    // Remove the close-to-tray handler so the app actually quits
                    app.exit(0)
                },
            },
        ])

        tray?.setContextMenu(contextMenu)
    }

    buildMenu()

    // Double-click tray icon → show window
    tray.on('double-click', () => {
        showWindow()
    })
}
