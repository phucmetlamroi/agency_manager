// [Giải trí] POST /api/ent/uploads/initiate — xin URL ký để đẩy phim lên R2.
// Chỉ mã ENT_ADMIN. Người xem gọi vào đây nhận 403.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { apiError, apiJson, parseBody } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { requireEntSession } from '@/lib/ent/auth'
import { initiateEntUpload } from '@/lib/ent/upload-service'
import { ENT_TITLE_MAX } from '@/lib/ent/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z
    .object({
        fileName: z.string().min(1).max(255),
        // BigInt không qua được JSON — client gửi chuỗi thập phân.
        sizeBytes: z.string().regex(/^\d+$/),
        mimeType: z.string().max(200),
        title: z.string().max(ENT_TITLE_MAX).optional(),
        quality: z.enum(['basic', 'plus']).optional(),
        idempotencyKey: z.string().min(8).max(200).optional(),
    })
    .strict()

export const POST = withReviewRoute(async (req: NextRequest) => {
    const session = await getSession()
    if (!session?.user?.id) throw apiError(401, 'UNAUTHORIZED', 'Cần đăng nhập.')
    await requireEntSession(req.cookies, { role: 'ENT_ADMIN' })

    const parsed = await parseBody(req, schema)
    if (!parsed.ok) return parsed.res

    const result = await initiateEntUpload({
        fileName: parsed.data.fileName,
        sizeBytes: BigInt(parsed.data.sizeBytes),
        mimeType: parsed.data.mimeType,
        title: parsed.data.title ?? null,
        quality: parsed.data.quality,
        idempotencyKey: parsed.data.idempotencyKey ?? null,
        uploadedById: session.user.id,
    })
    return apiJson(result.body, { status: result.status })
})
