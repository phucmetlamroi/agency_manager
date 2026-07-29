/**
 * [AUDIT HT-037] Preload RIÊNG cho cửa sổ setup wizard.
 *
 * VÌ SAO TÁCH RA: trước đây cửa sổ wizard và cửa sổ ứng dụng chính dùng CHUNG `preload.js`, nên
 * mọi thứ wizard cần (đọc/ghi secret hạ tầng) cũng nằm sẵn trong tay renderer của web app. Mà
 * renderer đó CHÍNH LÀ toàn bộ ứng dụng Next.js — React cùng hàng trăm dependency. Chỉ cần một
 * primitive thực thi script trong đó là `await window.hustly.getEnvVars()` trả về JWT_SECRET
 * (ký được token của bất kỳ admin nào) và DATABASE_URL (đọc/ghi thẳng Postgres prod).
 *
 * Ranh giới thật nằm ở CHỖ NẠP TRANG, không phải ở vai trò người dùng:
 *   · wizard  — `loadFile(assets/setup-wizard.html)` → origin `file://`, HTML do chính ta viết,
 *               không nạp mã bên ngoài. Đây mới là chỗ có quyền chạm cấu hình.
 *   · app chính — `loadURL('http://localhost:<port>')` → toàn bộ bề mặt web app.
 *
 * Grep xác nhận `window.hustly` KHÔNG được dùng ở bất kỳ đâu trong `src/`: web app chưa bao giờ
 * cần cầu nối này, nên thu hồi nó không làm hỏng chức năng nào.
 *
 * ⚠️ Đây chỉ là hàng rào THỨ NHẤT. Preload chỉ lọc được những gì renderer gọi tới; hàng rào thật
 * nằm ở main process (`ipc-handlers.ts` đối chiếu DANH TÍNH cửa sổ gửi với chính cửa sổ wizard).
 * Đừng bỏ hàng rào kia đi vì thấy file này đã lọc rồi.
 */
import { contextBridge, ipcRenderer } from 'electron'

/** Chỉ các kênh wizard thực sự dùng. */
const WIZARD_CHANNELS = ['wizard:complete', 'wizard:test-db'] as const

contextBridge.exposeInMainWorld('hustly', {
    platform: process.platform,
    isDesktop: true,

    // Cấu hình: CHỈ cửa sổ này có.
    getEnvVars: (): Promise<Record<string, string>> =>
        ipcRenderer.invoke('env:get-all'),

    setEnvVar: (key: string, value: string): Promise<void> =>
        ipcRenderer.invoke('env:set', key, value),

    invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
        if ((WIZARD_CHANNELS as readonly string[]).includes(channel)) {
            return ipcRenderer.invoke(channel, ...args)
        }
        return Promise.reject(new Error(`IPC channel "${channel}" is not allowed`))
    },
})
