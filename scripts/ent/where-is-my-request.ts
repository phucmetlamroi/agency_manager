/**
 * [Chẩn đoán] Yêu cầu đang chờ nằm ở workspace NÀO — chỉ đọc.
 *
 * Có vì thông báo và hộp thư KHÔNG cùng phạm vi:
 *   • notifyProfileAdmins(profileId) — theo HỒ SƠ, không lọc workspace ⇒ luôn tới
 *   • getClientRequests(workspaceId) — theo WORKSPACE LẤY TỪ URL
 * Nên yêu cầu rơi vào workspace tháng này mà đang mở hộp thư của workspace tháng
 * trước thì màn hình trống — và trống ĐÚNG, không phải lỗi. Script in ra địa chỉ
 * cần mở để khỏi phải đoán.
 *
 * Chạy: npx tsx scripts/ent/where-is-my-request.ts
 */
import { prisma } from '../../src/lib/db'

async function main() {
    const pending = await prisma.clientTaskRequest.findMany({
        where: { status: { in: ['NEW', 'REVIEWING'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, status: true, workspaceId: true, createdAt: true },
    })

    if (pending.length === 0) {
        console.log('\nKhông có yêu cầu nào đang chờ xử lý (NEW/REVIEWING). Hộp thư trống là ĐÚNG.\n')
        return
    }

    // Gom theo workspace: mỗi workspace là một địa chỉ hộp thư riêng.
    const byWs = new Map<string, typeof pending>()
    for (const r of pending) {
        const list = byWs.get(r.workspaceId) ?? []
        list.push(r)
        byWs.set(r.workspaceId, list)
    }

    console.log(`\n${pending.length} yêu cầu đang chờ, nằm ở ${byWs.size} workspace:\n`)
    for (const [wsId, list] of byWs) {
        const ws = await prisma.workspace.findUnique({ where: { id: wsId }, select: { name: true } })
        console.log(`  ▸ Workspace "${ws?.name ?? '(không tìm thấy)'}" — ${list.length} yêu cầu`)
        console.log(`    MỞ ĐỊA CHỈ NÀY:  /${wsId}/admin/requests`)
        for (const r of list) {
            const mins = Math.round((Date.now() - r.createdAt.getTime()) / 60000)
            console.log(`      · ${r.status.padEnd(9)} ${String(mins).padStart(4)} phút trước  ${r.title}`)
        }
        console.log('')
    }
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
