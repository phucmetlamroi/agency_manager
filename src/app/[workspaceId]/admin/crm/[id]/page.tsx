import { serializeDecimal } from '@/lib/serialization'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { prisma as globalPrisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import ClientAnalytics from '@/components/crm/ClientAnalytics'
import CreateSubClientButton from '@/components/crm/CreateSubClientButton'
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
    let profileId = (session.user as any).sessionProfileId as string | null | undefined
    if (!profileId) {
        const firstAccess = await globalPrisma.profileAccess.findFirst({
            where: { userId: session.user.id },
            select: { profileId: true },
            orderBy: { grantedAt: 'asc' },
        })
        profileId = firstAccess?.profileId ?? null
        if (!profileId) redirect('/login')
    }

    // Fetch Client with Subsidiaries, Tasks, and Invoices
    const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
    const client = await workspacePrisma.client.findUnique({
        where: { id },
        include: {
            subsidiaries: {
                where: { status: 'ACTIVE' },
                include: {
                    tasks: {
                        orderBy: { createdAt: 'desc' },
                        take: 5
                    }
                }
            },
            tasks: {
                orderBy: { createdAt: 'desc' },
                take: 20,
                include: { rating: true }
            },
            invoices: {
                orderBy: { issueDate: 'desc' },
                take: 20
            },
            projects: true
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
        distribution = [{ name: 'Direct Tasks', value: client.tasks.length }]
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

