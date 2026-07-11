import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import {
    getWorkspaceAuditLogs,
    getAuditLogActionTypes,
    getAuditLogActors,
} from '@/actions/audit-actions'
import AuditLogViewer from '@/components/workspace/AuditLogViewer'
import MobileAuditLog from '@/components/admin/MobileAuditLog'
import { isMobileDevice } from '@/lib/device'

export default async function AdminAuditLogPage({
    params,
}: {
    params: Promise<{ workspaceId: string }>
}) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    // Security: each server action calls verifyWorkspaceAccess(workspaceId, 'ADMIN')
    // internally — no redundant page-level check needed. Admin layout already gates access.
    // If the first action rejects, Promise.all throws and we redirect.
    let logsResult, actionTypes, actors
    try {
        ;[logsResult, actionTypes, actors] = await Promise.all([
            getWorkspaceAuditLogs(workspaceId, {}, 1, 25),
            getAuditLogActionTypes(workspaceId),
            getAuditLogActors(workspaceId),
        ])
    } catch {
        redirect(`/${workspaceId}/admin`)
    }

    // [Mobile P4.3 / M9] Dispatcher UA: mobile → danh sách humanize hoá; desktop giữ
    // AuditLogViewer.tsx NGUYÊN VẸN (nhánh return bên dưới không đổi 1 byte). Cùng props
    // server-fetched → không đổi chữ ký action, không đổi schema.
    if (await isMobileDevice()) {
        return (
            <MobileAuditLog
                workspaceId={workspaceId}
                initialLogs={logsResult.logs}
                initialTotal={logsResult.total}
                initialPage={logsResult.page}
                initialPageSize={logsResult.pageSize}
                initialTotalPages={logsResult.totalPages}
                actionTypes={actionTypes}
                actors={actors}
            />
        )
    }

    return (
        <div className="max-w-[1200px] mx-auto">
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
    )
}
