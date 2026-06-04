import { NextResponse } from 'next/server'
import { AccessToken } from 'livekit-server-sdk'
import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import { authorizeChannel } from '@/lib/channel-permissions'

// livekit-server-sdk signs JWTs with `jose` → must run on the Node runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * [Phase 2 · LiveKit] Mint a short-lived room token for a channel call.
 * The secret API key/secret never leave the server. Caller must be able to VIEW
 * the channel (anyone who can read it can join its call). Returns 503 when calls
 * aren't configured (keys unset) so the UI can degrade gracefully.
 */
export async function POST(request: Request) {
    let body: any
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const workspaceId = String(body?.workspaceId || '')
    const channelId = String(body?.channelId || '')
    if (!workspaceId || !channelId) {
        return NextResponse.json({ error: 'Missing workspaceId or channelId' }, { status: 400 })
    }

    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET
    const url = process.env.NEXT_PUBLIC_LIVEKIT_URL
    if (!apiKey || !apiSecret || !url) {
        return NextResponse.json(
            { error: 'Tính năng gọi chưa được cấu hình (thiếu LIVEKIT_API_KEY / LIVEKIT_API_SECRET / NEXT_PUBLIC_LIVEKIT_URL).' },
            { status: 503 },
        )
    }

    try {
        const { userId } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
        await authorizeChannel(workspaceId, channelId, 'VIEW')

        const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { displayName: true, username: true, avatarUrl: true },
        })
        const displayName = dbUser?.displayName || dbUser?.username || 'Thành viên'

        const room = `channel:${channelId}`
        const at = new AccessToken(apiKey, apiSecret, {
            identity: userId,
            name: displayName,
            ttl: '2h',
            metadata: JSON.stringify({ avatarUrl: dbUser?.avatarUrl ?? null }),
        })
        at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true })
        const token = await at.toJwt() // async in livekit-server-sdk v2

        return NextResponse.json({ token, url, room })
    } catch (error: any) {
        if (typeof error?.message === 'string' && error.message.startsWith('SECURITY_VIOLATION')) {
            return NextResponse.json({ error: 'Bạn không có quyền tham gia cuộc gọi của kênh này.' }, { status: 403 })
        }
        console.error('[livekit/token]', error)
        return NextResponse.json({ error: 'Không tạo được token cuộc gọi.' }, { status: 500 })
    }
}
