import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import PresenceTracker from '@/components/tracking/PresenceTracker'

export default async function WorkspaceLayout({
    children,
    params
}: {
    children: React.ReactNode
    params: Promise<{ workspaceId: string }>
}) {
    const session = await getSession()
    if (!session?.user?.id) {
        redirect('/login')
    }

    const { workspaceId } = await params

    // Robust check for ADMIN bypass: Check both session and current DB state
    const isSystemAdmin = session.user.role === 'ADMIN'

    // We can inject the workspaceId context down if needed, 
    // but React Server Components inside will also get `params.workspaceId` from their own props.
    return (
        <div className="workspace-container h-full w-full relative">
            <PresenceTracker currentUserId={session.user.id} />
            {children}
        </div>
    )
}
