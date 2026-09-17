/**
 * Hàng rào hồi quy cho `safeNextPath` — chống open-redirect sau đăng nhập.
 *
 * Chạy:  npx tsx scripts/assert-safe-next-path.ts
 * Đạt: in "OK <n>/<n>" và thoát 0. Trượt: in từng ca sai và thoát 1.
 *
 * VÌ SAO CÓ FILE NÀY: lỗ hổng gốc không phải "thiếu kiểm tra" mà là "kiểm tra trên chuỗi KHÁC với
 * chuỗi trình duyệt sẽ dùng". Loại lỗi đó không thấy được bằng đọc mã nhanh, và rất dễ tái sinh khi
 * ai đó "đơn giản hoá" hàm về so khớp trực tiếp trên `raw`. Test ĐI QUA HÀM THẬT (import từ
 * src/lib), không dựng lại logic.
 *
 * ⚠️ MỌI ký tự điều khiển trong file này đều dựng bằng `String.fromCharCode` CÓ CHỦ ĐÍCH — tuyệt đối
 * không gõ trực tiếp. Lần đầu viết file này tôi gõ thẳng NUL/DEL vào chuỗi: git coi file là binary,
 * và một trong hai byte đó nằm ngay trong biểu thức nên logic đọc lệch. Cùng loại sự cố đã xảy ra ở
 * electron/main/env-manager.ts trong đợt vá trước.
 */
import { safeNextPath } from '../src/lib/safe-next-path'

/** Dựng ký tự điều khiển an toàn — xem cảnh báo ở đầu file. */
const ctrl = (code: number) => String.fromCharCode(code)
const TAB = ctrl(0x09)
const LF = ctrl(0x0a)
const CR = ctrl(0x0d)
const NUL = ctrl(0x00)
const DEL = ctrl(0x7f)
const SOH = ctrl(0x01)
const US = ctrl(0x1f)

type Case = { name: string; input: unknown; expect: string | null }

/** Mô phỏng đúng bước trình duyệt làm: xoá TAB/LF/CR rồi phân giải tương đối. */
function browserResolves(path: string): string {
    const stripped = path.replace(/[\t\n\r]/g, '')
    return new URL(stripped, 'https://hustlytasker.xyz').origin
}

const SELF = 'https://hustlytasker.xyz'

const cases: Case[] = [
    // ── Phải TỪ CHỐI: chuỗi lách bằng ký tự điều khiển (đây là lỗ đã vá) ──
    { name: 'TAB giữa hai dấu gạch (ca khai thác thật)', input: `/${TAB}/evil.com`, expect: null },
    { name: 'LF giữa hai dấu gạch', input: `/${LF}/evil.com`, expect: null },
    { name: 'CR giữa hai dấu gạch', input: `/${CR}/evil.com`, expect: null },
    { name: 'NUL giữa hai dấu gạch', input: `/${NUL}/evil.com`, expect: null },
    { name: 'DEL giữa hai dấu gạch', input: `/${DEL}/evil.com`, expect: null },
    { name: 'SOH giữa hai dấu gạch', input: `/${SOH}/evil.com`, expect: null },
    { name: 'US giữa hai dấu gạch', input: `/${US}/evil.com`, expect: null },
    { name: 'TAB dẫn đầu rồi //', input: `${TAB}//evil.com`, expect: null },
    { name: 'nhiều ký tự điều khiển liên tiếp', input: `/${TAB}${CR}${LF}/evil.com`, expect: null },
    { name: 'ký tự điều khiển che backslash', input: `/${TAB}\\evil.com`, expect: null },

    // ── Phải TỪ CHỐI: các dạng open-redirect cổ điển ──
    { name: 'protocol-relative //', input: '//evil.com', expect: null },
    { name: 'backslash /\\', input: '/\\evil.com', expect: null },
    { name: 'backslash ở giữa', input: '/a\\b', expect: null },
    { name: 'URL tuyệt đối https', input: 'https://evil.com', expect: null },
    { name: 'không bắt đầu bằng /', input: 'evil.com', expect: null },
    { name: 'chuỗi rỗng', input: '', expect: null },
    { name: 'chỉ gồm ký tự điều khiển', input: `${TAB}${TAB}`, expect: null },
    { name: 'không phải chuỗi', input: 42, expect: null },
    { name: 'null', input: null, expect: null },
    { name: 'undefined', input: undefined, expect: null },

    // ── Phải TỪ CHỐI: đường bị loại theo chủ đích ──
    { name: '/api bị loại', input: '/api/cron/purge', expect: null },
    { name: '/login bị loại (chống vòng lặp)', input: '/login?next=/x', expect: null },

    // ── Phải CHO QUA: đường nội bộ hợp lệ ──
    { name: 'gốc', input: '/', expect: '/' },
    { name: 'dashboard', input: '/ws123/dashboard', expect: '/ws123/dashboard' },
    { name: 'có query', input: '/ws123/admin/queue?tab=all', expect: '/ws123/admin/queue?tab=all' },
    { name: 'có fragment', input: '/ws123/admin#top', expect: '/ws123/admin#top' },
    { name: 'tiếng Việt đã encode', input: '/ws1/t%C3%A0i-ch%C3%ADnh', expect: '/ws1/t%C3%A0i-ch%C3%ADnh' },
]

let pass = 0
const failures: string[] = []

for (const c of cases) {
    const got = safeNextPath(c.input)
    if (got === c.expect) pass++
    else failures.push(`  ✗ ${c.name}: expect ${JSON.stringify(c.expect)}, got ${JSON.stringify(got)}`)
}

// ── Hậu kiểm QUAN TRỌNG NHẤT: kiểm KẾT QUẢ, không kiểm DANH SÁCH ──
// Với MỌI chuỗi hàm cho qua, đích mà TRÌNH DUYỆT phân giải phải vẫn là chính miền của ta. Đây là
// khẳng định thật sự bảo vệ ta: nếu ai đó thêm một dạng lách mới mà bảng ca trên chưa có, chốt này
// vẫn bắt được — miễn chuỗi đó lọt qua hàm. (Bài học của cả chiến dịch: kiểm KẾT QUẢ, đừng kiểm
// danh sách các trường hợp mình nghĩ ra được.)
const fuzz: string[] = [
    `/${TAB}/evil.com`, `/${LF}/evil.com`, `/${NUL}/evil.com`, `/${DEL}/evil.com`,
    `/${TAB}${TAB}//evil.com`, `${CR}//evil.com`, `/${US}\\evil.com`,
    '//evil.com', '///evil.com', '/\\evil.com', '/\\\\evil.com',
    '/ok', '/a/b?c=d', '/', '/ws/admin#x',
]
let fuzzAccepted = 0
for (const raw of fuzz) {
    const accepted = safeNextPath(raw)
    if (accepted === null) continue
    fuzzAccepted++
    const origin = browserResolves(accepted)
    if (origin !== SELF) {
        failures.push(
            `  ✗ HẬU KIỂM: hàm cho qua ${JSON.stringify(raw)} → ${JSON.stringify(accepted)}, ` +
            `nhưng trình duyệt phân giải ra ${origin}`,
        )
    } else {
        pass++
    }
}

const total = cases.length + fuzzAccepted

if (failures.length > 0) {
    console.error(`FAIL ${pass}/${total}`)
    for (const f of failures) console.error(f)
    process.exit(1)
}
console.log(
    `OK ${pass}/${total} — safeNextPath chặn mọi dạng lách đã biết, ` +
    `và ${fuzzAccepted} đường được cho qua đều phân giải về ${SELF}`,
)
