/**
 * Kiểm hồi quy cho src/lib/ui/action-feedback.ts (kiểm toán 2026-07 · S2-2 / §5.1).
 *
 *   npm run test:offline-message
 *
 * Điều PHẢI giữ: câu "Mất kết nối" chỉ thay câu cũ khi nguyên nhân đúng là MẠNG.
 * Nếu vị từ nới rộng ra, nó sẽ nuốt mất những câu báo có ích nhất — "Bạn không có
 * quyền", "Task đã đổi trạng thái ở nơi khác" — và người dùng sẽ đi kiểm tra wifi
 * cho một lỗi phân quyền. Đó là kiểu hỏng im lặng, nên phải có bài kiểm giữ.
 *
 * Chạy trong Node nên `navigator` không tồn tại — nhánh navigator.onLine bị bỏ qua,
 * bài này soi đúng nhánh nhận dạng lỗi fetch. Nhánh navigator đã được đo trên trình
 * duyệt thật bằng scripts/audit-2026-07/verify-phase-c.ts (mục [5]).
 */
import { isNetworkFailure, failureMessage, OFFLINE_MESSAGE } from '../src/lib/ui/action-feedback'

const CASES: Array<[string, unknown, boolean]> = [
    // Ba hãng trình duyệt, ba câu khác nhau cho CÙNG một sự cố mạng.
    ['TypeError "Failed to fetch" (Chrome)', new TypeError('Failed to fetch'), true],
    ['TypeError "NetworkError…" (Firefox)', new TypeError('NetworkError when attempting to fetch resource.'), true],
    ['TypeError "Load failed" (Safari)', new TypeError('Load failed'), true],

    // Máy chủ TỪ CHỐI — câu gốc phải được giữ nguyên.
    ['Lỗi phân quyền từ máy chủ', new Error('Bạn không có quyền trên phiên tải lên này.'), false],
    ['Lỗi chung của Server Component', new Error('An error occurred in the Server Components render'), false],
    ['TypeError KHÔNG phải lỗi mạng', new TypeError('x is not a function'), false],
    ['Ném ra một chuỗi thô', 'hỏng', false],
    ['Ném ra undefined', undefined, false],
]

let failed = 0
for (const [name, err, want] of CASES) {
    const got = isNetworkFailure(err)
    const ok = got === want
    if (!ok) failed++
    console.log(`${ok ? '  ✓' : '  ✗'} ${name.padEnd(42)} -> ${got}${ok ? '' : `  (mong đợi ${want})`}`)
}

// Và câu hiện ra phải khớp với kết luận đó.
const denied = failureMessage(new Error('Không đủ quyền.'), 'Cập nhật thất bại')
const offline = failureMessage(new TypeError('Failed to fetch'), 'Cập nhật thất bại')
console.log(`\n  máy chủ từ chối -> "${denied}"`)
console.log(`  mất mạng        -> "${offline}"`)
if (denied !== 'Cập nhật thất bại') { console.log('  ✗ câu gốc bị thay oan'); failed++ }
if (offline !== OFFLINE_MESSAGE) { console.log('  ✗ không đổi sang câu mất kết nối'); failed++ }

console.log(failed ? `\n${failed} trường hợp SAI` : '\nTất cả đều đúng.')
process.exit(failed ? 1 : 0)
