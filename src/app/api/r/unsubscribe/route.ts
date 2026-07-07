// [review-fixes P4/FR-11] /api/r/unsubscribe?token= — one-click unsubscribe (RFC 8058).
// Slug-less: the opaque unsubscribeToken IS the authorization. Idempotent; always neutral (never
// reveals whether the token matched). ONLY POST mutates — this is the List-Unsubscribe target
// (List-Unsubscribe-Post: List-Unsubscribe=One-Click). GET must be SAFE: mail-security scanners
// (Defender Safe Links, Mimecast, Proofpoint…) and prefetchers issue a GET to every URL in a
// message with no user interaction, so a mutating GET would silently unsubscribe recipients.
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

// Non-mutating: send a human to the read-only confirmation page (which POSTs on an explicit click);
// a scanner just follows the 302 and changes nothing.
export async function GET(req: NextRequest): Promise<NextResponse> {
    const token = tokenOf(req)
    const dest = new URL('/r/unsubscribe', req.url)
    if (token) dest.searchParams.set('token', token)
    return NextResponse.redirect(dest)
}
