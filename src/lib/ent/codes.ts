// [Giải trí] Vòng đời mã truy cập kho phim.
//
// Chỉ GLOBAL ADMIN (User.role === 'ADMIN') được tạo/thu hồi — người cầm mã
// ENT_ADMIN up phim được nhưng KHÔNG tự phát mã cho người khác. Ranh giới đó là
// lý do tính năng này còn "giới hạn người dùng" được.

import { customAlphabet } from 'nanoid'
import type { EntCodeRole } from '@prisma/client'
import { prisma } from '@/lib/db'
import { normalizeEntCode } from './code-format'

// Bỏ 0/O/1/I/L — mã này đọc qua điện thoại/nhắn tay, nhầm một ký tự là mất buổi.
// 16 ký tự trên bảng 31 ⇒ ~79 bit, cộng với chặn dò 8 lần/15 phút thì dò tay vô vọng.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const makeCode = customAlphabet(ALPHABET, 16)

export { formatEntCode, normalizeEntCode } from './code-format'

export async function createEntCode(input: {
    role: EntCodeRole
    note?: string | null
    createdById: string
}) {
    return prisma.entAccessCode.create({
        data: {
            code: makeCode(),
            role: input.role,
            note: input.note?.trim() || null,
            createdById: input.createdById,
        },
    })
}

export async function revokeEntCode(codeId: string) {
    // updateMany + điều kiện revokedAt: null ⇒ bấm thu hồi hai lần không dời mốc thời gian.
    const r = await prisma.entAccessCode.updateMany({
        where: { id: codeId, revokedAt: null },
        data: { revokedAt: new Date() },
    })
    return r.count > 0
}

export async function listEntCodes() {
    return prisma.entAccessCode.findMany({
        orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
        select: {
            id: true,
            code: true,
            role: true,
            note: true,
            revokedAt: true,
            useCount: true,
            lastUsedAt: true,
            createdAt: true,
        },
    })
}

/**
 * Đổi mã người dùng gõ lấy một phiên. Trả null khi mã sai hoặc đã thu hồi —
 * người gọi phải trả CÙNG một thông báo cho cả hai, không thì màn nhập mã tự
 * biến thành công cụ dò xem mã nào từng tồn tại.
 */
export async function consumeCodeAttempt(rawInput: string) {
    const code = normalizeEntCode(rawInput)
    if (code.length < 8 || code.length > 32) return null // chặn rác trước khi chạm DB

    const row = await prisma.entAccessCode.findUnique({
        where: { code },
        select: { id: true, role: true, revokedAt: true },
    })
    if (!row || row.revokedAt) return null

    await prisma.entAccessCode.update({
        where: { id: row.id },
        data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
    })
    return { codeId: row.id, role: row.role }
}
