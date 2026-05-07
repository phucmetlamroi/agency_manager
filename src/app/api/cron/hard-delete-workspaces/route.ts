import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
import { audit } from '@/lib/audit-log'

/**
 * Cron job: hard-delete workspaces whose `hardDeleteAfter` has passed.
 *
 * Workspaces are soft-deleted by `deleteWorkspaceAction` with a 30-day grace
 * window (status='SOFT_DELETED', hardDeleteAfter = now + 30 days). Within that
 * window the OWNER can restore the workspace via `restoreWorkspaceAction`.
 *
 * After the grace period this cron permanently removes the workspace + all
 * cascading data (tasks, members, audit logs, etc.) per Prisma onDelete: Cascade.
 *
 * Schedule recommendation: daily.
 *
 *   curl -H "x-cron-secret: $CRON_SECRET" \
 *     https://hustlytasker.xyz/api/cron/hard-delete-workspaces
 */
export async function GET(request: Request) {
    // 1. Auth — same pattern as other crons
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

        // 2. Find soft-deleted workspaces past their grace window.
        // Cast to any: schema added `status`/`hardDeleteAfter` in migration
        // 20260507000000_workspace_security_phase1; if migration not applied,
        // this query throws and we catch + return 0.
        let candidates: { id: string; name: string }[] = []
        try {
            candidates = await prisma.workspace.findMany({
                where: {
                    status: 'SOFT_DELETED',
                    hardDeleteAfter: { lte: now },
                } as any,
                select: { id: true, name: true },
            })
        } catch (err: any) {
            if (err?.code === 'P2009' || /column.*does not exist/i.test(err?.message ?? '')) {
                console.warn('[hard-delete-workspaces] schema migration not yet applied — skipping')
                return NextResponse.json({ deleted: 0, skipped: 'migration pending' })
            }
            throw err
        }

        const deleted: { id: string; name: string }[] = []

        for (const ws of candidates) {
            try {
                // Audit BEFORE deletion (workspaceId reference still valid).
                await audit({
                    workspaceId: ws.id,
                    actorUserId: null, // system-initiated
                    action: 'workspace.hard_deleted',
                    targetType: 'Workspace',
                    targetId: ws.id,
                    before: { name: ws.name },
                })

                await prisma.workspace.delete({ where: { id: ws.id } })
                deleted.push(ws)
            } catch (err: any) {
                console.error(`[hard-delete-workspaces] failed to delete ${ws.id}:`, err?.message)
            }
        }

        return NextResponse.json({ deleted: deleted.length, ids: deleted.map(d => d.id) })
    } catch (err: any) {
        console.error('[hard-delete-workspaces] cron error:', err)
        return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
    }
}
