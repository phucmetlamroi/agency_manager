// [Review module P5.1] POST /api/review/shares/:id/revoke (API-SPEC §5.4, FR-F04).
// Body {revoked?: boolean} — default true; false = un-revoke [S]. Creator or ADMIN.
// Kill-switch only: comments/activity stay; guests get 410 on next request.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiJson, parseBody } from '@/lib/review/errors'
import { withReviewRoute } from '@/lib/review/route-auth'
import { setShareRevoked } from '@/lib/review/shares'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const schema = z.object({ revoked: z.boolean().optional() }).strict()

export const POST = withReviewRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { id } = await params
    // Empty body allowed (plain revoke).
    let revoked = true
    if ((req.headers.get('content-length') ?? '0') !== '0') {
        const parsed = await parseBody(req, schema)
        if (!parsed.ok) return parsed.res
        revoked = parsed.data.revoked ?? true
    }
    return apiJson(await setShareRevoked(id, revoked))
})
