import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { determineLandingForProfile } from '@/lib/profile-routing'

/**
 * Return first workspace + target view ('admin' or 'dashboard') for the given
 * profileId. View is determined by user's role in workspaces of that profile —
 * OWNER/ADMIN → admin view, otherwise dashboard view.
 *
 * Response: { workspaceId: string | null, view: 'admin' | 'dashboard' }
 */
export async function GET(req: Request) {
    const session = await getSession()
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profileId = new URL(req.url).searchParams.get('profileId')
    if (!profileId) {
        return NextResponse.json({ error: 'Missing profileId' }, { status: 400 })
    }

    const isGlobalAdmin =
        session.user.role === 'ADMIN' || !!(session.user as any).isTreasurer

    const result = await determineLandingForProfile(
        session.user.id,
        profileId,
        isGlobalAdmin,
    )

    return NextResponse.json(result)
}
