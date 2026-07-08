// [Phase C] RFC 8058 One-Click unsubscribe for portal notify emails. POST mutates (from the
// List-Unsubscribe-Post header); GET never mutates — it redirects to the confirm page (email
// scanners prefetch GETs, so a GET-mutate would silently unsubscribe people — finding P4-R4).
import { NextRequest, NextResponse } from 'next/server'
import { unsubscribePortalNotify } from '@/actions/share-portal-actions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const token = req.nextUrl.searchParams.get('token') || ''
    await unsubscribePortalNotify(token)
    return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
    const token = req.nextUrl.searchParams.get('token') || ''
    return NextResponse.redirect(new URL(`/portal-notify/unsubscribe?token=${encodeURIComponent(token)}`, req.url))
}
