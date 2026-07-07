// [review-fixes P4/FR-11] /api/r/unsubscribe?token= — one-click unsubscribe (RFC 8058).
// Slug-less: the opaque unsubscribeToken IS the authorization. POST = email-client one-click
// (List-Unsubscribe-Post: List-Unsubscribe=One-Click). GET = a human hitting the URL directly.
// Idempotent; always 200 and never reveals whether the token matched (no enumeration).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { unsubscribeGuestByToken } from '@/lib/review/guest-subscribe'

function tokenOf(req: NextRequest): string {
    return new URL(req.url).searchParams.get('token')?.trim() ?? ''
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    await unsubscribeGuestByToken(tokenOf(req))
    return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
    await unsubscribeGuestByToken(tokenOf(req))
    return NextResponse.json({ ok: true })
}
