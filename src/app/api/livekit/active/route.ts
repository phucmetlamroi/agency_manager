import { NextResponse } from 'next/server'
import { RoomServiceClient } from 'livekit-server-sdk'
import { verifyWorkspaceAccess } from '@/lib/security'
import { authorizeChannel } from '@/lib/channel-permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * [Phase 2 · LiveKit] How many people are currently in a channel's call.
 * LiveKit (not our DB) is the source of truth → fixes the "Join call" banner for
 * late joiners / refreshers / hard tab-closes that miss the ephemeral broadcast.
 * Returns { count, configured }. `configured:false` when keys are unset.
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId') || ''
    const channelId = searchParams.get('channelId') || ''
    if (!workspaceId || !channelId) {
        return NextResponse.json({ error: 'Missing params' }, { status: 400 })
    }

    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET
    const url = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL
    if (!apiKey || !apiSecret || !url) {
        return NextResponse.json({ count: 0, configured: false })
    }

    try {
        await verifyWorkspaceAccess(workspaceId, 'MEMBER')
        await authorizeChannel(workspaceId, channelId, 'VIEW')

        // RoomServiceClient talks to the HTTP API — normalize wss:// → https://.
        const httpUrl = url.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:')
        const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret)
        let count = 0
        try {
            const participants = await svc.listParticipants(`channel:${channelId}`)
            count = participants.length
        } catch {
            // Room not created yet (no active call) → treat as empty.
            count = 0
        }
        return NextResponse.json({ count, configured: true })
    } catch (error: any) {
        if (typeof error?.message === 'string' && error.message.startsWith('SECURITY_VIOLATION')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        console.error('[livekit/active]', error)
        return NextResponse.json({ count: 0, configured: true })
    }
}
