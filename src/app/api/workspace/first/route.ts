import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: Request) {
    const session = await getSession()
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profileId = new URL(req.url).searchParams.get('profileId')
    if (!profileId) {
        return NextResponse.json({ error: 'Missing profileId' }, { status: 400 })
    }

    const ws = await prisma.workspace.findFirst({
        where: { profileId },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
    })

    return NextResponse.json({ workspaceId: ws?.id ?? null })
}
