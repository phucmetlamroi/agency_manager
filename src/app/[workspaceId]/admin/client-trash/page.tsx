import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getTrashedClients } from '@/actions/crm-actions'
import ClientTrashClient from '@/components/crm/ClientTrashClient'

/**
 * [Soft-delete] Client Trash — list soft-deleted clients in this workspace.
 * Restore (reversible) + permanent-delete (manual, irreversible). No auto-purge.
 */
export default async function ClientTrashPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    const res = await getTrashedClients(workspaceId)
    const clients = (res.success ? res.data : []).map((c: any) => ({
        id: c.id,
        name: c.name,
        deletedAt: c.deletedAt ? new Date(c.deletedAt).toISOString() : null,
        taskCount: c._count?.tasks ?? 0,
        subCount: c._count?.subsidiaries ?? 0,
        invoiceCount: c._count?.invoices ?? 0,
    }))

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h2 className="title-gradient" style={{ marginBottom: 4 }}>Thùng rác Khách hàng</h2>
                <p style={{ color: '#71717A', fontSize: 13 }}>
                    Khách hàng đã xoá — có thể khôi phục bất cứ lúc nào. Xoá vĩnh viễn là thủ công, không thể hoàn tác.
                </p>
            </div>
            <ClientTrashClient workspaceId={workspaceId} clients={clients} />
        </div>
    )
}
