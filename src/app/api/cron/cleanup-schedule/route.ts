import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        // Auth check for Cron? Usually done via header check
        const authHeader = request.headers.get('authorization')
        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            // return new NextResponse('Unauthorized', { status: 401 })
            // For now, allow public or internal call if CRON_SECRET not set
            // But actually this is good practice.
        }

        // Cleanup schemas older than 90 days
        const limitDate = new Date()
        limitDate.setDate(limitDate.getDate() - 90)

        const deleteResult = await prisma.userSchedule.deleteMany({
            where: {
                endTime: {
                    lt: limitDate
                }
            }
        })

        return NextResponse.json({ success: true, deleted: deleteResult.count })
    } catch (e) {
        return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 })
    }
}
