import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import PresenceTracker from '@/components/tracking/PresenceTracker'
import ImpersonationBanner from '@/components/layout/ImpersonationBanner'
import { ChatProvider } from '@/components/chat/ChatProvider'
import { ChatFloatingPanel } from '@/components/chat/ChatFloatingPanel'

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

    // MANDATORY: Check if user has selected a profile session
    const profileId = (session.user as any).sessionProfileId
    if (!profileId) {
        redirect('/login')
    }

    const { workspaceId } = await params

    const isSystemAdmin = session.user.role === 'ADMIN'

    // We can inject the workspaceId context down if needed, 
    // but React Server Components inside will also get `params.workspaceId` from their own props.
    return (
        <ChatProvider userId={session.user.id}>
            <div className="workspace-container h-full w-full relative flex flex-col">
                {session.user.isImpersonating && (
                    <ImpersonationBanner
                        username={session.user.nickname || session.user.username}
                        workspaceId={workspaceId}
                    />
                )}
                <PresenceTracker currentUserId={session.user.id} />
                <div className="flex-1 min-h-0 overflow-hidden relative">
                    {children}
                </div>
                <ChatFloatingPanel workspaceId={workspaceId} profileId={profileId} />
            </div>
        </ChatProvider>
    )
}
