/**
 * IPC handlers — bridge between preload.ts and Electron main process.
 *
 * Registers ipcMain.handle() / ipcMain.on() for every channel
 * exposed by the preload contextBridge.
 */
import { ipcMain, app, BrowserWindow } from 'electron'
import { getAllEnvVars, setEnvVar } from './env-manager'
import { getCronJobNames } from './cron-scheduler'
import { isWizardWebContents } from './setup-wizard'

/**
 * [AUDIT HT-037 fix] Chỉ cửa sổ setup wizard được chạm cấu hình.
 *
 * Allowlist trong preload là hàng rào thứ nhất, nhưng nó sống ở phía renderer và chỉ đúng chừng
 * nào preload còn được gắn đúng cửa sổ. Đây là hàng rào THẬT, đặt ở tiến trình đặc quyền.
 *
 * HAI tín hiệu ĐỘC LẬP, phải đúng CẢ HAI:
 *  1. DANH TÍNH — WebContents gọi tới phải chính là cửa sổ wizard ta tự tạo. Sau khi wizard đóng,
 *     không cửa sổ nào khớp, nên kênh này coi như không tồn tại trong suốt đời web app.
 *  2. ĐÚNG FRAME — preload mặc định chỉ chạy ở frame chính, nên `senderFrame.url` phải là chính
 *     trang wizard (`loadFile` ⇒ `file://`). Web app dùng `loadURL('http://localhost:<port>')`.
 *
 * KHÔNG có nhánh dự phòng sang `event.sender.getURL()`: hàm đó trả URL của CẢ WebContents chứ
 * không phải của frame đã gửi. Hôm nay hai thứ luôn trùng nhau, nhưng ngày ai đó bật
 * `nodeIntegrationInSubFrames`, một iframe `http://` nằm trong cửa sổ wizard sẽ mượn được URL
 * `file://` của khung ngoài. Thiếu tín hiệu ⇒ TỪ CHỐI, chứ không đoán.
 */
function isConfigWindow(event: Electron.IpcMainInvokeEvent): boolean {
    try {
        if (!isWizardWebContents(event.sender.id)) return false
        const frameUrl = event.senderFrame?.url
        return typeof frameUrl === 'string' && frameUrl.startsWith('file://')
    } catch {
        return false // fail-closed
    }
}

/** Ai vừa bị từ chối — để dòng log là vết kiểm toán dùng được, không chỉ là cái chuông báo. */
function senderLabel(event: Electron.IpcMainInvokeEvent): string {
    try {
        return event.senderFrame?.url || event.sender.getURL() || '(không rõ)'
    } catch {
        return '(không đọc được)'
    }
}

/**
 * Register all IPC handlers.  Call once from app.ready.
 */
export function registerIpcHandlers(): void {
    // ---------------------------------------------------------------------------
    // Environment / settings
    // ---------------------------------------------------------------------------
    ipcMain.handle('env:get-all', (event) => {
        // [AUDIT HT-037 fix] Trước đây kênh này trả nguyên object secret cho BẤT KỲ ai gọi được —
        // kể cả renderer chạy toàn bộ web app Next.js. Rò JWT_SECRET = ký được phiên của mọi tài
        // khoản; rò DATABASE_URL = mở thẳng Postgres prod.
        if (!isConfigWindow(event)) {
            console.error(`[ipc] env:get-all bị TỪ CHỐI — người gọi không phải cửa sổ cấu hình: ${senderLabel(event)}`)
            throw new Error('Not allowed')
        }
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
