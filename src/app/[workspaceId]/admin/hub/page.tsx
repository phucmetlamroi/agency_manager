import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyWorkspaceAccess } from '@/lib/security'
import { getHubData } from '@/actions/channel-actions'
import HubClient from '@/components/hub/HubClient'

export default async function HubPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params

    const session = await getSession()
    if (!session) redirect('/login')

    try {
        await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    } catch {
        redirect(`/${workspaceId}/dashboard`)
    }

    const { categories, channels, isAdmin, currentUserId } = await getHubData(workspaceId)

    return (
        <HubClient
            workspaceId={workspaceId}
            initialCategories={categories}
            initialChannels={channels}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
        />
    )
}
