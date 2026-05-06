import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
    const session = await getSession()
    if (!session?.user?.id) {
        return NextResponse.json({ userIds: [] }, { status: 401 })
    }

    const userId = session.user.id

    const conversationId = request.nextUrl.searchParams.get('conversationId')
    if (!conversationId) {
        return NextResponse.json({ userIds: [] }, { status: 400 })
    }

    const callerParticipant = await prisma.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
    })
    if (!callerParticipant) {
        return NextResponse.json({ userIds: [] }, { status: 403 })
    }

    const participants = await prisma.conversationParticipant.findMany({
        where: { conversationId },
        select: { userId: true },
    })

    return NextResponse.json({ userIds: participants.map(p => p.userId) })
}
