import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export default async function WorkspaceLayout({
    children,
    params
}: {
    children: React.ReactNode
    params: { workspaceId: string }
}) {
    const session = await getSession()
    if (!session?.user?.id) {
        redirect('/login')
    }

    const { workspaceId } = params

    // Validate that the user actually has access to this workspace
    const membership = await prisma.workspaceMember.findUnique({
        where: {
            userId_workspaceId: {
                userId: session.user.id,
                workspaceId: workspaceId
            }
        },
        include: {
            workspace: true
        }
    })

    if (!membership) {
        // If they don't have access, or it doesn't exist, send them back to the portal
        redirect('/workspaces')
    }

    // We can inject the workspaceId context down if needed, 
    // but React Server Components inside will also get `params.workspaceId` from their own props.
    return (
        <div className="workspace-container h-full w-full relative">
            {children}
        </div>
    )
}
