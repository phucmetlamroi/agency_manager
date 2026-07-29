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
    // Environment / settings — ĐÃ GỠ
    // ---------------------------------------------------------------------------
    // [AUDIT HT-037 fix] `getEnvVars` từng trả về NGUYÊN object secret hạ tầng (DATABASE_URL,
    // JWT_SECRET, CRON_SECRET, RESEND_API_KEY, UPSTASH token…) cho renderer — mà renderer ở đây
    // là toàn bộ web app Next.js. Bất kỳ XSS hay một dependency bị nhiễm nào cũng chỉ cần gọi
    // `await window.hustly.getEnvVars()` là leo từ "chạy được script trong tab" lên "chiếm toàn bộ
    // backend": JWT_SECRET ký được phiên của bất kỳ admin nào, DATABASE_URL mở thẳng Postgres prod.
    // Web app KHÔNG hề dùng cầu nối này (grep `window.hustly` trong src/ = 0 kết quả), nên gỡ đi
    // không mất chức năng nào. Wizard — nơi thật sự cần — nay dùng `wizard-preload.ts` riêng.
    // ⚠️ ĐỪNG thêm lại vào đây. Nếu về sau cần màn Cài đặt trong app, hãy trả về danh sách key
    // KHÔNG nhạy cảm qua một kênh riêng, đừng mở lại cả object.
    //
    // [AUDIT HT-038 fix] `setEnvVar` cũng đã gỡ. Đóng mỗi đường ĐỌC là chưa đủ: GHI dẫn tới đúng
    // cái đích mà đọc từng dẫn tới. `setEnvVar('JWT_SECRET', <giá trị của kẻ tấn công>)` rồi khởi
    // động lại là ký được phiên của bất kỳ admin nào — không cần đọc secret cũ, chỉ cần thay nó
    // bằng cái mình biết. `setEnvVar('DATABASE_URL', …)` lái toàn bộ ứng dụng sang Postgres của
    // kẻ tấn công. Cả hai giá trị này được next-server.ts trải vào env của tiến trình Next.js con.

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
        // [AUDIT HT-037 fix] Gỡ 'env:get-all' khỏi đây NỮA. Chỉ xoá hàm `getEnvVars` ở trên là
        // chưa đủ: cửa hậu này nhận tên kênh dạng chuỗi, nên `window.hustly.invoke('env:get-all')`
        // vẫn lấy được toàn bộ secret. Đúng kiểu bẫy "vá một đường, để hở đường kia".
        // Cùng lý do, 'wizard:*' cũng chuyển sang wizard-preload: 'wizard:test-db' cho phép người
        // gọi bắt tiến trình chính kết nối tới MỘT máy chủ Postgres BẤT KỲ do họ chỉ định — không
        // có việc gì để web app chạm tới nó.
        // [AUDIT HT-038 fix] 'env:set' gỡ nốt, đúng cái bẫy đã gặp ở HT-037: xoá hàm `setEnvVar`
        // ở trên mà để tên kênh lại thì `invoke('env:set', …)` vẫn ghi được như thường.
        const allowedChannels = [
            'app:version',
            'cron:status',
        ]
        if (allowedChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, ...args)
        }
        return Promise.reject(new Error(`IPC channel "${channel}" is not allowed`))
    },
})
