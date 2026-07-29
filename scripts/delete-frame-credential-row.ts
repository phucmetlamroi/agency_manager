/**
 * [AUDIT HT-022] Xoá hàng Task 'global-system-settings' — nơi cất mật khẩu Frame.io DÙNG CHUNG
 * dưới dạng CHỮ THƯỜNG trong cột notes_vi.
 *
 * VÌ SAO PHẢI XOÁ chứ không chỉ khoá cổng:
 * `getFrameAccount()` trả plaintext cho bất kỳ ai đăng nhập, suốt vòng đời của hàng này. Ai từng
 * đăng ký một tài khoản đều lấy được. Nên giá trị đó phải coi như ĐÃ LỘ — khoá cổng chỉ ngăn
 * người mới, không lấy lại được thứ đã ra ngoài. Hai action đọc/ghi đã bị gỡ khỏi code; hàng dữ
 * liệu là phần còn lại.
 *
 * ⚠️ ĐỔI MẬT KHẨU FRAME.IO là việc riêng, script này KHÔNG làm thay được. Xoá hàng mà không đổi
 * mật khẩu thì mật khẩu cũ vẫn dùng đăng nhập Frame.io được.
 *
 * CÁCH CHẠY — mặc định chỉ XEM, không xoá:
 *     npx tsx scripts/delete-frame-credential-row.ts
 *     npx tsx scripts/delete-frame-credential-row.ts --apply
 *
 * Kiểm DATABASE_URL đang trỏ đâu TRƯỚC khi thêm --apply.
 */
import { PrismaClient } from '@prisma/client'

const TASK_ID = 'global-system-settings'
const apply = process.argv.includes('--apply')
const prisma = new PrismaClient()

async function main() {
    const host = (process.env.DATABASE_URL || '').match(/@([^/?]+)/)?.[1] ?? '(không đọc được)'
    console.log(`\n  Database host: ${host}`)
    console.log(`  Chế độ: ${apply ? 'XOÁ THẬT (--apply)' : 'chỉ xem (thêm --apply để xoá)'}\n`)

    const row = await prisma.task.findUnique({
        // KHÔNG select notes_vi — đó chính là chuỗi bí mật. Chỉ cần biết hàng có tồn tại không
        // và có nội dung hay không; in ra là lại rò thêm một lần nữa vào log.
        select: { id: true, title: true, status: true, workspaceId: true, createdAt: true },
        where: { id: TASK_ID },
    })

    if (!row) {
        console.log('  Không tìm thấy hàng — có thể đã xoá rồi. Không làm gì.\n')
        return
    }

    console.log('  Tìm thấy:')
    console.log(`     id          : ${row.id}`)
    console.log(`     title       : ${row.title}`)
    console.log(`     status      : ${row.status}`)
    console.log(`     workspaceId : ${row.workspaceId ?? 'null (đúng như thiết kế cũ)'}`)
    console.log(`     createdAt   : ${row.createdAt.toISOString()}`)
    console.log('     notes_vi    : (cố tình KHÔNG in — đây là chuỗi chứa mật khẩu)\n')

    if (!apply) {
        console.log('  Chưa xoá. Chạy lại kèm --apply nếu host ở trên đúng là database bạn muốn.\n')
        return
    }

    await prisma.task.delete({ where: { id: TASK_ID } })
    console.log('  ✅ Đã xoá hàng.')
    console.log('  ⚠️ Việc còn lại: ĐỔI MẬT KHẨU Frame.io. Giá trị cũ phải coi như đã lộ.\n')
}

main()
    .catch((e) => {
        console.error('  Lỗi:', e instanceof Error ? e.message : String(e))
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
