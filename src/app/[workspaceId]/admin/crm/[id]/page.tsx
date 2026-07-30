import { serializeDecimal } from '@/lib/serialization'
import { getWorkspacePrisma, resolveActiveProfileId } from '@/lib/prisma-workspace'
import { prisma as globalPrisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import ClientAnalytics from '@/components/crm/ClientAnalytics'
import CreateSubClientButton from '@/components/crm/CreateSubClientButton'
import MobileClientDetail from '@/components/crm/MobileClientDetail'
import { isMobileDevice } from '@/lib/device'
import { notFound, redirect } from 'next/navigation'

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string, workspaceId: string }> }) {
    const { id: paramId, workspaceId } = await params
    const id = parseInt(paramId)
    if (isNaN(id)) return notFound()

    // [Canonical Clients] Client queries are profile-scoped now — resolve the
    // session profileId (same fallback pattern as admin/page.tsx) so the
    // middleware's fail-closed guard passes AND the lookup can't cross profiles.
    const session = await getSession()
    if (!session) redirect('/login')
    // [Task-loss A1] Reconcile with the workspace's OWN profile — see resolveActiveProfileId.
    const profileId = await resolveActiveProfileId(session.user.id, workspaceId, (session.user as any).sessionProfileId)
    if (!profileId) redirect('/login')

    // Fetch Client with Subsidiaries, Tasks, and Invoices
    //
    // [AUDIT N2 fix] MỌI QUAN HỆ LỒNG PHẢI TỰ KHOÁ `workspaceId`.
    //
    // `getWorkspacePrisma` CÓ chèn workspaceId/profileId vào `where` cho các phép đọc — nhưng chỉ
    // ở TẦNG TRÊN (prisma-workspace.ts:138 chặn theo `operation`). Prisma client extension không
    // viết lại các quan hệ đọc lồng trong `include`. Mà `Client` nay có phạm vi theo PROFILE (mọi
    // workspace cùng profile thấy chung một tập khách canonical), nên `client.tasks` không lọc gì
    // sẽ trả về task của MỌI workspace trong profile — kèm `notes_vi`, tức ghi chú nội bộ.
    //
    // `crm-actions.ts:32` (getClients) đã làm đúng việc này và ghi rõ lý do trong chú thích của nó;
    // trang chi tiết là chỗ duy nhất quên. Đây là khuôn có sẵn, không phải thiết kế mới.
    const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
    const client = await workspacePrisma.client.findUnique({
        where: { id },
        include: {
            subsidiaries: {
                where: { status: 'ACTIVE' },
                include: {
                    tasks: {
                        where: { workspaceId },
                        orderBy: { createdAt: 'desc' },
                        take: 5
                    }
                }
            },
            tasks: {
                where: { workspaceId },
                orderBy: { createdAt: 'desc' },
                take: 20,
                include: { rating: true }
            },
            invoices: {
                where: { workspaceId },
                orderBy: { issueDate: 'desc' },
                take: 20
            },
            projects: { where: { workspaceId } }
        }
    })

    // [Soft-delete] a trashed/merged client isn't reachable from the active CRM
    if (!client || client.status !== 'ACTIVE') return notFound()

    // Fetch client's User account to get ratings they submitted
    const clientUser = await globalPrisma.user.findFirst({
        where: { username: client.name }
    })

    // Ratings submitted by this client's user account
    const ratings = clientUser ? await globalPrisma.rating.findMany({
        where: { workspaceId, clientId: clientUser.id },
        include: {
            task: { select: { id: true, title: true } },
            staff: { select: { username: true, nickname: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
    }) : []

    // Distribution for Pie Chart
    let distribution: { name: string; value: number }[] = []
    if (client.subsidiaries.length > 0) {
        distribution = client.subsidiaries.map(sub => ({
            name: sub.name,
            value: sub.tasks.length
        })).filter(d => d.value > 0)
    } else {
        distribution = [{ name: 'Task trực tiếp', value: client.tasks.length }]
    }

    // [Mobile 3j] Dispatcher — desktop bento (return below) untouched. Mobile gets a compact
    // stacked layout composed from the SAME data (client + tasks + invoices + ratings).
    if (await isMobileDevice()) {
        return (
            <MobileClientDetail
                client={serializeDecimal(client) as any}
                ratings={serializeDecimal(ratings) as any}
                workspaceId={workspaceId}
            />
        )
    }

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">Chi tiết Hồ sơ Khách hàng</h1>
                {!client.parentId && (
                    <CreateSubClientButton parentId={client.id} parentName={client.name} workspaceId={workspaceId} />
                )}
            </div>
            <ClientAnalytics
                client={serializeDecimal(client) as any}
                distribution={distribution}
                workspaceId={workspaceId}
                ratings={serializeDecimal(ratings) as any}
            />
        </div>
    )
}

