// [Giải trí] Quản lý mã truy cập. Cổng là GLOBAL ADMIN (User.role), KHÔNG phải
// mã ENT_ADMIN — người được phát mã quản trị up phim được nhưng không được tự
// phát mã cho người khác. Đó là ranh giới giữ cho tính năng này còn "giới hạn".

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiJson, parseBody } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { verifyActiveSession } from '@/lib/security'
import { createEntCode, listEntCodes } from '@/lib/ent/codes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireGlobalAdmin(): Promise<string> {
    const { status, dbUser } = await verifyActiveSession()
    if (status !== 'active' || !dbUser) throw apiError(401, 'UNAUTHORIZED', 'Cần đăng nhập.')
    if (dbUser.role !== 'ADMIN') throw apiError(403, 'FORBIDDEN', 'Chỉ quản trị hệ thống mới quản lý được mã.')
    return dbUser.id
}

export const GET = withReviewRoute(async () => {
    await requireGlobalAdmin()
    return apiJson({ codes: await listEntCodes() })
})

const createSchema = z
    .object({
        role: z.enum(['ENT_ADMIN', 'ENT_VIEWER']),
        note: z.string().max(200).optional(),
    })
    .strict()

export const POST = withReviewRoute(async (req: NextRequest) => {
    const userId = await requireGlobalAdmin()
    const parsed = await parseBody(req, createSchema)
    if (!parsed.ok) return parsed.res

    const code = await createEntCode({
        role: parsed.data.role,
        note: parsed.data.note ?? null,
        createdById: userId,
    })
    return apiJson(code, { status: 201 })
})
