import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
import { audit } from '@/lib/audit-log'

/**
 * [Sprint Z+1] Cron job: hard-delete profiles whose `hardDeleteAfter` has passed.
 *
 * Profiles soft-deleted by `deleteProfileAction` với 30-day grace window
 * (status='SOFT_DELETED', hardDeleteAfter = now + 30 days). Trong window đó
 * OWNER có thể restore qua `restoreProfileAction`.
 *
 * After grace period: cron xóa permanent + cascade workspaces/tasks/members
 * theo Prisma onDelete: Cascade.
 *
 * Schedule: daily 3am (vercel.json).
 *
 *   curl -H "x-cron-secret: $CRON_SECRET" \
 *     https://hustlytasker.xyz/api/cron/hard-delete-profiles
 */
export async function GET(request: Request) {
    // Auth same pattern as other crons
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

        // Find soft-deleted profiles past grace window.
        let candidates: { id: string; name: string; _count: { workspaces: number; users: number } }[] = []
        try {
            candidates = await prisma.profile.findMany({
                where: {
                    status: 'SOFT_DELETED',
                    hardDeleteAfter: { lte: now },
                } as any,
                select: {
                    id: true,
                    name: true,
                    _count: { select: { workspaces: true, users: true } },
                },
            })
        } catch (err: any) {
            if (err?.code === 'P2009' || /column.*does not exist/i.test(err?.message ?? '')) {
                console.warn('[hard-delete-profiles] schema migration not yet applied — skipping')
                return NextResponse.json({ deleted: 0, skipped: 'migration pending' })
            }
            throw err
        }

        const deleted: { id: string; name: string }[] = []

        for (const p of candidates) {
            try {
                // Audit BEFORE deletion với metadata cho forensics
                await audit({
                    workspaceId: 'SYSTEM',
                    actorUserId: null,
                    action: 'profile.hard_deleted' as any,
                    targetType: 'Profile',
                    targetId: p.id,
                    before: {
                        name: p.name,
                        workspaceCount: p._count.workspaces,
                        userCount: p._count.users,
                    },
                })

                // Cascade delete via Prisma onDelete: Cascade defined in schema
                await prisma.profile.delete({ where: { id: p.id } })
                deleted.push({ id: p.id, name: p.name })
            } catch (err: any) {
                console.error(`[hard-delete-profiles] failed to delete ${p.id}:`, err?.message)
            }
        }

        return NextResponse.json({ deleted: deleted.length, profiles: deleted })
    } catch (err: any) {
        console.error('[hard-delete-profiles] cron error:', err)
        return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
    }
}
