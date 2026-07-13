// [Giao diện 2 · Mission Control · M29 Nhật ký hoạt động] MC-shell wrapping the real AuditLogViewer.
// Thinnest possible reuse: same 3 server actions the admin page uses (getWorkspaceAuditLogs +
// action-types + actors), same props → AuditLogViewer NGUYÊN VẸN (own filter bar · action/actor/
// date/target filters · row-expand before→after JSON · 25/trang · giờ VN · redact password/token/
// secret server-side). Admin-gated fail-closed. /admin/audit-log byte-identical.
// NOTE (GĐ1 follow-up, ngoài scope port): the before/after redactor strips only credentials, NOT
// money fields — if a task snapshot with jobPriceUSD was ever audited it could surface in an
// expanded row. Same exposure as GĐ1 /admin/audit-log (both admin-only) → not a NEW leak here.
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import {
    getWorkspaceAuditLogs,
    getAuditLogActionTypes,
    getAuditLogActors,
} from '@/actions/audit-actions'
import AuditLogViewer from '@/components/workspace/AuditLogViewer'
import McShell from '@/components/mission-control/McShell'

export const dynamic = 'force-dynamic'

export default async function MissionControlAuditPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    let logsResult, actionTypes, actors
    try {
        ;[logsResult, actionTypes, actors] = await Promise.all([
            getWorkspaceAuditLogs(workspaceId, {}, 1, 25),
            getAuditLogActionTypes(workspaceId),
            getAuditLogActors(workspaceId),
        ])
    } catch {
        redirect(`/${workspaceId}/dashboard`)
    }

    return (
        <McShell workspaceId={workspaceId} active="audit">
            <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto' }}>
                <AuditLogViewer
                    workspaceId={workspaceId}
                    initialLogs={logsResult.logs}
                    initialTotal={logsResult.total}
                    initialPage={logsResult.page}
                    initialPageSize={logsResult.pageSize}
                    initialTotalPages={logsResult.totalPages}
                    actionTypes={actionTypes}
                    actors={actors}
                />
            </div>
        </McShell>
    )
}
