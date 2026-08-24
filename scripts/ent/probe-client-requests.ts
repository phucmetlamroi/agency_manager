/**
 * [Chẩn đoán] Yêu cầu của khách CÓ nằm trong cơ sở dữ liệu không? — chỉ đọc.
 *
 * Tách bạch hai khả năng nhìn giống hệt nhau trên màn hình "Hộp thư yêu cầu trống":
 *   A. Chưa bao giờ ghi được  ⇒ hỏng đường GỬI (khách bấm gửi nhưng thất bại)
 *   B. Ghi rồi mà không hiện  ⇒ hỏng đường ĐỌC (lọc sai phạm vi, hoặc bộ nhớ đệm)
 * Có thông báo mà hộp thư trống thì gần như chắc là B — nhưng phải nhìn hàng thật
 * mới dám nói, vì thông báo có thể đi đường khác.
 *
 * Chạy: npx tsx scripts/ent/probe-client-requests.ts
 */
import { prisma } from '../../src/lib/db'

async function main() {
    const total = await prisma.clientTaskRequest.count()
    console.log(`\nTổng số yêu cầu trong bảng ClientTaskRequest: ${total}`)
    if (total === 0) {
        console.log('\n⇒ Bảng RỖNG. Yêu cầu chưa bao giờ ghi được ⇒ hỏng đường GỬI, không phải đường đọc.\n')
        return
    }

    const rows = await prisma.clientTaskRequest.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
            id: true,
            title: true,
            status: true,
            profileId: true,
            workspaceId: true,
            clientId: true,
            submittedVia: true,
            createdAt: true,
        },
    })
    console.log('\n15 yêu cầu gần nhất:\n')
    for (const r of rows) {
        const mins = Math.round((Date.now() - r.createdAt.getTime()) / 60000)
        const ago = mins < 60 ? `${mins} phút trước` : `${Math.floor(mins / 60)}h${mins % 60}p trước`
        console.log(`  ${r.status.padEnd(9)} ${ago.padEnd(16)} ws=${r.workspaceId.slice(0, 8)} prof=${r.profileId.slice(0, 8)} client=${r.clientId ?? '—'}  ${r.title.slice(0, 40)}`)
    }

    // Nhóm theo trạng thái: hộp thư thường CHỈ hiện NEW, nên nếu tất cả đã bị
    // chuyển trạng thái thì màn hình trống là ĐÚNG chứ không phải lỗi.
    const byStatus = await prisma.clientTaskRequest.groupBy({ by: ['status'], _count: true })
    console.log('\nTheo trạng thái:')
    for (const g of byStatus) console.log(`  ${g.status.padEnd(9)} ${g._count}`)

    // Phạm vi: hộp thư lọc theo (workspaceId, profileId). Lệch một trong hai là
    // hàng có thật nhưng người đang đăng nhập không nhìn thấy.
    const byScope = await prisma.clientTaskRequest.groupBy({
        by: ['workspaceId', 'profileId'],
        _count: true,
    })
    console.log('\nTheo phạm vi (workspace × hồ sơ):')
    for (const g of byScope) {
        const ws = await prisma.workspace.findUnique({ where: { id: g.workspaceId }, select: { name: true } })
        console.log(`  ws=${g.workspaceId.slice(0, 8)} (${ws?.name ?? 'KHÔNG TÌM THẤY WORKSPACE'})  prof=${g.profileId.slice(0, 8)}  → ${g._count} yêu cầu`)
    }
    console.log('')
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
