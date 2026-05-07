import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'

/**
 * Cron route: Clean up old notifications.
 *
 * Schedule: daily at 2:00 AM UTC (0 2 * * *)
 * - Deletes archived notifications older than 30 days
 * - Deletes read notifications older than 90 days
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization')
    const headerKey =
        request.headers.get('x-cron-secret') ||
        request.headers.get('x-cron-key') ||
        null
    const bearerKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const key = headerKey || bearerKey
    const secret = process.env.CRON_SECRET

    if (!secret) {
        return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
    }

    if (key !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const now = new Date()
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

        // 1. Delete archived notifications > 30 days old
        const archivedDeleted = await prisma.notification.deleteMany({
            where: {
                isArchived: true,
                createdAt: { lt: thirtyDaysAgo },
            },
        })

        // 2. Delete read notifications > 90 days old
        const readDeleted = await prisma.notification.deleteMany({
            where: {
                isRead: true,
                isArchived: false,
                createdAt: { lt: ninetyDaysAgo },
            },
        })

        return NextResponse.json({
            success: true,
            archivedDeleted: archivedDeleted.count,
            readDeleted: readDeleted.count,
            totalDeleted: archivedDeleted.count + readDeleted.count,
        })
    } catch (error) {
        console.error('Cleanup Notifications Cron Error:', error)
        return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 })
    }
}
