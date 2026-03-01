import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

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

    // Fetch the user's role to allow ADMIN bypass
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true }
    })

    if (user?.role !== 'ADMIN') {
        // Validate that the user actually has access to this workspace
        const membership = await prisma.workspaceMember.findFirst({
            where: {
                userId: session.user.id,
                workspaceId: workspaceId
            }
        })

        if (!membership) {
            // If they don't have access, or it doesn't exist, send them back to the portal
            redirect('/workspaces')
        }
    }

    // We can inject the workspaceId context down if needed, 
    // but React Server Components inside will also get `params.workspaceId` from their own props.
    return (
        <div className="workspace-container h-full w-full relative">
            {children}
        </div>
    )
}
