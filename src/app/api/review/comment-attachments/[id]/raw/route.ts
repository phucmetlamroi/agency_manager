// [Review module P4.1] GET a comment attachment → 302 to a fresh short-lived signed
// R2 URL (member-auth re-checked through comment→version→asset→workspace). This gives
// the client a STABLE <img src> that doesn't churn on every 5s poll.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { withReviewRoute } from '@/lib/review/route-auth'
import { getAttachmentRawUrl } from '@/lib/review/comments'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withReviewRoute<Ctx>(async (_req: NextRequest, { params }) => {
    const { id } = await params
    const url = await getAttachmentRawUrl(id)
    return NextResponse.redirect(url, { status: 302 })
})
