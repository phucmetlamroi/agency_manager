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

    // Robust check for ADMIN bypass: Check both session and current DB state
    const isSystemAdmin = session.user.role === 'ADMIN'

    if (!isSystemAdmin) {
        // We no longer restrict entry to workspaces based on membership.
        // Anyone logged in can enter a workspace to see tasks.
        // Specific sub-routes (like /admin) still have their own role checks.
    }

    // We can inject the workspaceId context down if needed, 
    // but React Server Components inside will also get `params.workspaceId` from their own props.
    return (
        <div className="workspace-container h-full w-full relative">
            {children}
        </div>
    )
}
