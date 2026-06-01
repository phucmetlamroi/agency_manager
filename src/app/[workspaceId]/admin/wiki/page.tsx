import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyWorkspaceAccess } from '@/lib/security'
import { getWikiTree } from '@/actions/wiki-actions'
import WikiClient from '@/components/hub/WikiClient'

export default async function WikiPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params

    const session = await getSession()
    if (!session) redirect('/login')

    try {
        await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    } catch {
        redirect(`/${workspaceId}/dashboard`)
    }

    const { pages } = await getWikiTree(workspaceId)

    return <WikiClient workspaceId={workspaceId} initialPages={pages} />
}
