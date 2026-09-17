/**
 * [PHẢN BIỆN vòng 4 · REG-1 — phương án 1 do chủ dự án chọn]
 *
 * Điền `Workspace.profileId` cho những workspace đang NULL, để bước sau có thể đặt cột thành
 * NOT NULL và mọi nhánh fail-closed của chiến dịch vá lệch nguồn trở thành KHÔNG-THỂ-VỚI-TỚI.
 *
 * VÌ SAO CẦN: sau chiến dịch, 7 chức năng admin (tạo task, xuất/xem/huỷ hoá đơn, ghi thanh toán,
 * đổi vai trò, đổi Người quản lý) đều TỪ CHỐI khi workspace không có profileId — trong khi giao
 * diện vẫn render bình thường và không có cách nào sửa trong app.
 *
 * ⚠️ SCRIPT NÀY KHÔNG ĐOÁN. Nó chỉ đề xuất khi các tín hiệu ĐỒNG THUẬN về đúng MỘT profile. Mâu
 * thuẫn hoặc không có tín hiệu ⇒ xếp vào MANUAL và KHÔNG đụng tới. Gán nhầm một workspace tháng
 * sang tenant khác là gán nhầm cả sổ lương và sổ tiền của tháng đó.
 *
 * TÍN HIỆU, theo thứ tự ưu tiên:
 *   1. DỮ LIỆU — `profileId` non-null đã có trên chính các hàng Task / Invoice / Payment thuộc
 *      workspace. Đây là tín hiệu mạnh nhất: các hàng đó đã tự khai mình thuộc tenant nào.
 *   2. THÀNH VIÊN — ProfileAccess của các WorkspaceMember. Chỉ dùng khi workspace hoàn toàn rỗng
 *      dữ liệu (chưa có task/hoá đơn/thanh toán nào).
 *
 * CÁCH CHẠY
 *   npx tsx scripts/backfill-workspace-profile-id.ts            # chỉ BÁO CÁO, không ghi
 *   npx tsx scripts/backfill-workspace-profile-id.ts --apply    # ghi thật
 *
 * Thoát mã 1 khi còn mục MANUAL ⇒ CHƯA được đặt cột NOT NULL.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

type Decision =
    | { kind: 'PROPOSE'; profileId: string; source: 'data' | 'members'; detail: string }
    | { kind: 'MANUAL'; reason: string }

/** Che bớt chuỗi kết nối, chỉ để người chạy xác nhận đúng database. */
function dbLabel(): string {
    const url = process.env.DATABASE_URL ?? ''
    const m = url.match(/@([^/?]+)/)
    return m ? m[1] : '(không đọc được DATABASE_URL)'
}

async function decide(workspaceId: string): Promise<Decision> {
    // ── Tín hiệu 1: dữ liệu đã có trong chính workspace ──────────────────────────
    const [tasks, invoices, payments] = await Promise.all([
        prisma.task.findMany({
            where: { workspaceId, profileId: { not: null } },
            select: { profileId: true },
            distinct: ['profileId'],
        }),
        prisma.invoice.findMany({
            where: { workspaceId, profileId: { not: null } },
            select: { profileId: true },
            distinct: ['profileId'],
        }),
        prisma.payment.findMany({
            where: { workspaceId, profileId: { not: null } },
            select: { profileId: true },
            distinct: ['profileId'],
        }),
    ])

    const dataIds = new Set<string>()
    for (const r of [...tasks, ...invoices, ...payments]) {
        if (r.profileId) dataIds.add(r.profileId)
    }

    if (dataIds.size === 1) {
        const only = [...dataIds][0]
        return {
            kind: 'PROPOSE',
            profileId: only,
            source: 'data',
            detail: `task=${tasks.length} invoice=${invoices.length} payment=${payments.length} đều trỏ về 1 profile`,
        }
    }
    if (dataIds.size > 1) {
        return {
            kind: 'MANUAL',
            reason: `MÂU THUẪN: dữ liệu trong workspace trỏ về ${dataIds.size} profile khác nhau (${[...dataIds].join(', ')}). Cần người quyết.`,
        }
    }

    // ── Tín hiệu 2: thành viên (chỉ khi workspace rỗng dữ liệu) ──────────────────
    const members = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        select: { userId: true },
    })
    if (members.length === 0) {
        return { kind: 'MANUAL', reason: 'Không có dữ liệu VÀ không có thành viên — không suy ra được gì.' }
    }

    const accesses = await prisma.profileAccess.findMany({
        where: { userId: { in: members.map((m) => m.userId) } },
        select: { profileId: true },
        distinct: ['profileId'],
    })
    const memberIds = new Set(accesses.map((a) => a.profileId))

    if (memberIds.size === 1) {
        const only = [...memberIds][0]
        return {
            kind: 'PROPOSE',
            profileId: only,
            source: 'members',
            detail: `workspace rỗng dữ liệu; ${members.length} thành viên đều chỉ thuộc 1 profile`,
        }
    }
    return {
        kind: 'MANUAL',
        reason:
            memberIds.size === 0
                ? 'Thành viên không có ProfileAccess nào.'
                : `Thành viên trải trên ${memberIds.size} profile (${[...memberIds].join(', ')}) — không đủ căn cứ.`,
    }
}

async function main() {
    console.log(`\n=== Backfill Workspace.profileId ===`)
    console.log(`Database : ${dbLabel()}`)
    console.log(`Chế độ   : ${APPLY ? '⚠️  GHI THẬT (--apply)' : 'CHỈ BÁO CÁO (thêm --apply để ghi)'}\n`)

    const targets = await prisma.workspace.findMany({
        where: { profileId: null },
        select: { id: true, name: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
    })

    if (targets.length === 0) {
        console.log('✅ Không có workspace nào thiếu profileId. Có thể sang bước đặt cột NOT NULL.')
        return
    }

    console.log(`Tìm thấy ${targets.length} workspace thiếu profileId.\n`)

    const proposals: Array<{ id: string; name: string; profileId: string; source: string; detail: string }> = []
    const manual: Array<{ id: string; name: string; reason: string }> = []

    for (const ws of targets) {
        const d = await decide(ws.id)
        if (d.kind === 'PROPOSE') {
            proposals.push({ id: ws.id, name: ws.name, profileId: d.profileId, source: d.source, detail: d.detail })
            console.log(`  ✔ ${ws.name.padEnd(24)} [${ws.status}] → ${d.profileId}  (${d.source}: ${d.detail})`)
        } else {
            manual.push({ id: ws.id, name: ws.name, reason: d.reason })
            console.log(`  ✖ ${ws.name.padEnd(24)} [${ws.status}] → CẦN NGƯỜI QUYẾT: ${d.reason}`)
        }
    }

    console.log(`\nTổng: ${proposals.length} đề xuất tự động, ${manual.length} cần người quyết.`)

    if (!APPLY) {
        console.log('\nChưa ghi gì cả. Xem lại danh sách trên; nếu đồng ý thì chạy lại kèm --apply.')
    } else if (proposals.length > 0) {
        console.log('\nĐang ghi…')
        let ok = 0
        for (const p of proposals) {
            // updateMany + điều kiện `profileId: null` để idempotent: chạy lại không đè hàng đã có profile.
            const res = await prisma.workspace.updateMany({
                where: { id: p.id, profileId: null },
                data: { profileId: p.profileId },
            })
            if (res.count > 0) ok++
        }
        console.log(`✅ Đã ghi ${ok}/${proposals.length} workspace.`)
    }

    if (manual.length > 0) {
        console.log(
            `\n⚠️  CÒN ${manual.length} WORKSPACE CHƯA GẮN PROFILE — ĐỪNG đặt cột NOT NULL lúc này.\n` +
            `   Với mỗi mục, quyết định thủ công rồi cập nhật, ví dụ:\n` +
            `   UPDATE "Workspace" SET "profileId" = '<profile-id>' WHERE id = '<workspace-id>';\n` +
            `   Rồi chạy lại script này cho tới khi báo 0 mục.`,
        )
        process.exitCode = 1
    } else if (APPLY) {
        console.log(
            `\n✅ Không còn workspace nào thiếu profileId.\n` +
            `   BƯỚC TIẾP THEO (chủ dự án chạy, KHÔNG tự động):\n` +
            `   1. prisma/schema.prisma: đổi  profileId String?  →  profileId String\n` +
            `   2. ALLOW_DB_PUSH=1 npx prisma db push\n` +
            `   3. Chạy lại script này để xác nhận vẫn 0 mục.`,
        )
    }
}

main()
    .catch((e) => {
        console.error('\n❌ Lỗi:', e)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
