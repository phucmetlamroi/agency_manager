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
 * [AUDIT HT-037 fix] Cửa sổ đang gọi IPC có ĐÚNG là wizard không?
 *
 * Đây là DANH TÍNH, không phải suy đoán: so id của WebContents với chính cửa sổ ta tự tạo.
 * Trả false khi wizard chưa mở hoặc đã đóng — tức là suốt thời gian web app chạy, không WebContents
 * nào khớp được, kể cả khi ai đó lỡ gắn nhầm preload.
 */
export function isWizardWebContents(webContentsId: number): boolean {
    if (!wizardWindow || wizardWindow.isDestroyed()) return false
    return wizardWindow.webContents.id === webContentsId
}

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
                // [AUDIT HT-037 fix] Preload RIÊNG. Wizard là cửa sổ DUY NHẤT được chạm cấu hình;
                // cửa sổ ứng dụng chính (window-manager.ts) giữ `preload.js` đã bị thu hồi quyền đó.
                preload: path.join(__dirname, 'wizard-preload.js'),
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
 * [AUDIT HT-039 fix] Dựng cấu hình kết nối sao cho QUYẾT ĐỊNH TLS CỦA TA LÀ CÁI THẬT SỰ CÓ HIỆU LỰC.
 *
 * Bản cũ làm ngược đời: `connectionString.includes('sslmode=require') ? { rejectUnauthorized:false }`
 * — đúng những người yêu cầu TLS an toàn lại bị hạ xuống chấp nhận MỌI chứng chỉ. Kết nối vẫn mã
 * hoá nhưng hết chống được người đứng giữa, mà chuỗi kết nối thì chứa sẵn user/password Postgres
 * PROD và ta gửi nó đi ngay lúc bấm "Test DB".
 *
 * ⚠️ VÌ SAO PHẢI GỠ `sslmode` KHỎI CHUỖI, chứ không chỉ truyền `ssl` cho đúng:
 * `new Client({ connectionString, ssl })` KHÔNG đảm bảo `ssl` của ta thắng. pg dựng
 * ConnectionParameters bằng cách trộn chuỗi kết nối đã phân tích ĐÈ LÊN config, và
 * pg-connection-string tự đặt khoá `ssl` mỗi khi thấy bất kỳ tham số ssl* nào. Nghĩa là ở mọi
 * chuỗi có `sslmode=…`, giá trị ta truyền vào bị VỨT BỎ — bản vá vòng đầu của tôi hoàn toàn vô
 * hiệu, và tôi chỉ biết sau khi người phản biện chạy thử thư viện. Gỡ hẳn tham số đó ra thì không
 * còn gì để ghi đè, nên cách này đúng bất kể thư viện ưu tiên bên nào (kể cả khi họ đổi ở bản sau
 * — pg-connection-string đã cảnh báo sắp đổi `require` thành KHÔNG xác thực cert).
 *
 * KHÔNG có lối tắt tắt-xác-thực. Vòng trước tôi thêm `sslmode=no-verify`, và nó sai ba đường:
 * (a) tên đó là quy ước riêng của node-postgres, KHÔNG phải libpq — mà cùng chuỗi này còn được
 *     truyền cho Prisma ở next-server.ts, nơi không hiểu nó;
 * (b) regex quét cả chuỗi thô, nên chữ "sslmode=no-verify" nằm trong MẬT KHẨU hay tên database
 *     cũng tắt được xác thực — mật khẩu tự nó thành công tắt bảo mật;
 * (c) không ai cần nó: Neon dùng CA công khai, Node tin sẵn.
 */
function buildClientConfig(connectionString: string): {
    connectionString: string
    connectionTimeoutMillis: number
    ssl?: boolean | { rejectUnauthorized: boolean }
} {
    const base = { connectionTimeoutMillis: 8000 }

    let url: URL
    try {
        url = new URL(connectionString)
    } catch {
        // Dạng key=value của libpq (`host=… sslmode=require`) — không phải URL. Để pg tự xử lý
        // thay vì đoán mò bằng chuỗi; đây không phải dạng Neon sinh ra.
        return { connectionString, ...base }
    }

    // Đọc từ searchParams (đã giải mã %XX, tách đúng phần truy vấn) chứ KHÔNG regex chuỗi thô —
    // nhờ vậy mật khẩu, tên database hay fragment có chứa "sslmode=" đều không đánh lừa được.
    // Lấy giá trị CUỐI để khớp cách libpq xử lý tham số lặp.
    const modes = url.searchParams.getAll('sslmode')
    const mode = modes.length ? modes[modes.length - 1].trim().toLowerCase() : null

    // ⚠️ KHÔNG có ngoại lệ nào ở đây, kể cả khi người dùng tự cấp CA.
    // Vòng trước tôi có một nhánh "thấy sslcert/sslkey/sslrootcert thì trả nguyên chuỗi, coi như
    // người dùng đã cấu hình có chủ đích". Nhánh đó DỰNG LẠI ĐÚNG công tắc mà vòng này tuyên bố đã
    // xoá: trả nguyên chuỗi nghĩa là `sslmode=no-verify` còn nguyên, và pg-connection-string vẫn
    // áp nó KỂ CẢ khi có cert. Rẻ đến mức lố: `?sslcert=` (giá trị RỖNG) làm `searchParams.has`
    // trả true trong khi pgcs coi chuỗi rỗng là falsy nên chẳng đọc file nào — không tốn gì mà
    // tắt sạch xác thực. Tệ hơn, `sslrootcert=/ca-thật.pem&sslmode=no-verify` thì CA được nạp rồi
    // bị phớt lờ, vì rejectUnauthorized:false đè lên ca. Tiền đề "cấp CA = an toàn" của tôi sai.
    // Nay để sslcert/sslkey/sslrootcert đi tiếp: pgcs dựng {ca, cert, key} mà KHÔNG đặt
    // rejectUnauthorized, và Node mặc định là true. CA của người dùng vừa được dùng vừa được THI
    // HÀNH, còn `no-verify` thì không còn chỗ nào để bám.
    //
    // `ssl` cũng phải gỡ: `?ssl=0` khiến pgcs đặt ssl=false và ghi đè quyết định của ta — tức là
    // gửi credential qua kênh KHÔNG mã hoá trên một chuỗi ghi rõ `sslmode=require`.
    //
    // ⚠️ NHƯNG PHẢI ĐỌC TRƯỚC KHI XOÁ. Vòng trước tôi xoá thẳng, và thế là quá tay: `ssl=true`
    // cùng `ssl=1` là dạng BẬT TLS của pg (dạng chuẩn của Heroku/Render/DigitalOcean), xoá đi thì
    // rơi vào nhánh "không khai gì" và chạy PLAINTEXT. Tức là một chuỗi nói rõ "dùng SSL" lại được
    // đối xử kém an toàn hơn chuỗi không nói gì — đúng nghịch lý mà HT-039 sinh ra để sửa, chỉ đổi
    // lớp áo. Và nó hỏng im lặng: "Test DB" báo thành công trong khi credential vừa đi qua mạng
    // không mã hoá.
    // Lấy giá trị CUỐI, giống hệt cách xử lý `sslmode` ở trên — và giống pgcs/libpq. Vòng trước
    // tôi dùng `.get()` (lấy giá trị ĐẦU) trong khi `sslmode` lấy cuối; hai chỗ cạnh nhau mà lệch
    // quy tắc, và độ lệch đó khai thác được theo chiều HẠ CẤP: `?ssl=0&ssl=true` thì ta chọn '0'
    // (plaintext) còn pgcs chọn 'true' (TLS) — ta tự hạ cấp một kết nối đáng lẽ được mã hoá.
    const sslParams = url.searchParams.getAll('ssl')
    const sslParam = sslParams.length ? sslParams[sslParams.length - 1].trim().toLowerCase() : null
    url.searchParams.delete('sslmode')
    url.searchParams.delete('ssl')
    // ⚠️ Danh sách xoá này BÁM THEO PHIÊN BẢN pg-connection-string. Quy tắc để người sau bảo trì:
    // bất kỳ tham số nào khiến pgcs tự đặt `config.ssl` đều phải có tên ở đây, nếu không nó sẽ ghi
    // đè quyết định bên dưới. Tính tới 2.13/2.14 đó là `ssl` và `sslmode` (thêm `sslnegotiation`
    // ở 2.14 nhưng nó cho ra ssl=true → vẫn xác thực, nên vô hại).
    // CỐ Ý không quét theo tiền tố /^ssl/: làm vậy sẽ xoá luôn `sslpassword` (mật khẩu của
    // sslkey — mất là hỏng cấu hình chứng chỉ khách hợp lệ) và `sslnegotiation`.
    // ⚠️ `cleaned` CHỈ dùng để dựng Client ngay tại đây. ĐỪNG lưu hay hiển thị nó: URLSearchParams
    // tuần tự hoá lại query (vd `%20` thành `+`), mà libpq/psql và Prisma đọc `+` là dấu cộng thật
    // — lưu lại sẽ âm thầm làm hỏng `options=` / `application_name`. DATABASE_URL ghi xuống đĩa
    // vẫn là chuỗi gốc người dùng nhập.
    const cleaned = url.toString()

    if (mode === 'disable') return { connectionString: cleaned, ...base, ssl: false }
    // Không khai sslmode → giữ NGUYÊN hành vi cũ (pg mặc định không bật TLS). Đổi mặc định ở đây
    // sẽ làm hỏng các kết nối Postgres nội bộ không có TLS; Neon thì luôn kèm sslmode nên đường
    // của sản phẩm thật không đi qua nhánh này.
    if (!mode) {
        // …TRỪ KHI chuỗi đã bật TLS bằng tham số `ssl`. Giữ đúng ý người dùng, và xác thực cert.
        //
        // ⚠️ QUY TẮC: CHỈ '0' là tắt; MỌI giá trị khác đều bật. Vòng trước tôi liệt kê ba giá trị
        // được coi là "bật" ('true'/'1'/'no-verify') và cho phần còn lại rơi về plaintext — sai
        // HÌNH DẠNG cho một quyết định TLS: gõ nhầm `?ssl=ture` là im lặng chạy không mã hoá.
        // Mặc định của một giá trị KHÔNG NHẬN RA phải là AN TOÀN, không phải tắt. Đây cũng đúng
        // bằng quy tắc của pg-connection-string, nên ta không còn lệch khỏi thư viện nữa.
        if (sslParam !== null && sslParam !== '0') {
            return { connectionString: cleaned, ...base, ssl: { rejectUnauthorized: true } }
        }
        return { connectionString: cleaned, ...base }
    }

    // require / prefer / allow / verify-ca / verify-full → XÁC THỰC chứng chỉ.
    return { connectionString: cleaned, ...base, ssl: { rejectUnauthorized: true } }
}

/**
 * Test a PostgreSQL connection string by attempting to connect.
 */
async function testDatabaseConnection(
    connectionString: string,
): Promise<{ success: boolean; error?: string }> {
    const client = new Client(buildClientConfig(connectionString))

    // [AUDIT HT-039 fix] HẬU KIỂM: nhìn vào KẾT QUẢ thật, thay vì tin rằng mình đã liệt kê đúng.
    // buildClientConfig phải đoán trước mọi tham số khiến pg-connection-string tự đặt `ssl` — và
    // riêng chỗ liệt kê đó bản vá này đã sai BA lần (bỏ sót `ssl=0`; nhánh "tự cấp CA" dựng lại
    // công tắc no-verify; allow-list ba giá trị khiến gõ nhầm là rơi về plaintext). Danh sách nào
    // cũng có thể thiếu; còn câu hỏi "cuối cùng có tắt xác thực không" thì chỉ có một đáp án.
    //
    // PHẠM VI THẬT của chốt này — nói đúng, đừng hứa quá:
    // nó bắt HAI hình dạng vô hiệu hoá xác thực mà pg-connection-string sinh ra được —
    //   · `rejectUnauthorized: false` (bỏ kiểm chuỗi chứng chỉ), và
    //   · `checkServerIdentity` bị thay bằng hàm rỗng (chuỗi vẫn kiểm, nhưng KHÔNG kiểm tên miền —
    //     ai cầm một chứng chỉ hợp lệ của BẤT KỲ tên miền nào cũng qua). pgcs phát ra đúng hình
    //     này hôm nay với `uselibpqcompat=true&sslmode=require|verify-ca`.
    // Nó KHÔNG bắt được thứ nằm ngoài đối tượng ssl, ví dụ biến môi trường
    // NODE_TLS_REJECT_UNAUTHORIZED=0 (tắt xác thực toàn tiến trình) — xem phần nợ đã ghi nhận.
    // Chỉ so sánh `=== false` cho rejectUnauthorized, đúng bằng quy tắc của chính Node: chuỗi
    // 'false' và số 0 KHÔNG tắt xác thực, nên nới lỏng phép so sánh sẽ chặn nhầm.
    const effectiveSsl = (client as unknown as { connectionParameters?: { ssl?: unknown } }).connectionParameters?.ssl
    if (
        effectiveSsl && typeof effectiveSsl === 'object' && (
            (effectiveSsl as { rejectUnauthorized?: boolean }).rejectUnauthorized === false ||
            typeof (effectiveSsl as { checkServerIdentity?: unknown }).checkServerIdentity === 'function'
        )
    ) {
        return {
            success: false,
            error: 'Từ chối kết nối: cấu hình này sẽ bỏ qua xác thực chứng chỉ TLS. Hãy sửa chuỗi kết nối.',
        }
    }

    try {
        await client.connect()
        const result = await client.query('SELECT 1 AS ok')
        await client.end()
        return { success: result.rows[0]?.ok === 1 }
    } catch (err: any) {
        try { await client.end() } catch { /* ignore */ }
        const raw: string = typeof err?.message === 'string' ? err.message : ''
        // [AUDIT HT-039 fix] KHÔNG chỉ người dùng cách tắt xác thực ở đây. Tên máy chủ không khớp
        // chứng chỉ (ERR_TLS_CERT_ALTNAME_INVALID) chính là dấu hiệu KINH ĐIỂN của một kẻ đứng
        // giữa — vòng vá trước của tôi gộp nó chung với "cert tự ký" rồi khuyên thêm no-verify,
        // tức là dạy đúng nạn nhân đang bị tấn công cách tự cởi giáp.
        if (/altname|Hostname\/IP does not match/i.test(raw)) {
            return {
                success: false,
                error:
                    'Chứng chỉ máy chủ không khớp tên miền trong chuỗi kết nối. ĐỪNG nhập tiếp — ' +
                    'kết nối có thể đang bị chặn giữa đường. Hãy kiểm tra lại chuỗi kết nối và ' +
                    `thử trên một mạng khác. (chi tiết: ${raw.slice(0, 120)})`,
            }
        }
        if (/self.?signed|unable to (verify|get local issuer)|UNABLE_TO_GET_ISSUER|CERT_/i.test(raw)) {
            return {
                success: false,
                error:
                    'Không xác thực được chứng chỉ TLS của máy chủ. Nếu đây là Postgres tự dựng, ' +
                    'hãy cấp chứng chỉ do một CA hợp lệ ký (hoặc thêm sslrootcert trỏ tới CA của bạn) ' +
                    `— phần mềm sẽ không kết nối khi chưa xác thực được. (chi tiết: ${raw.slice(0, 120)})`,
            }
        }
        return {
            success: false,
            error: raw.slice(0, 200) || 'Connection failed',
        }
    }
}
