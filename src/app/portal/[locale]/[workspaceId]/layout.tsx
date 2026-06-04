import { ReactNode } from 'react'
import { getPortalUserId } from '@/actions/client-portal-actions'
import '../../portal-calm.css'

/* Auth gate (legacy global CLIENT or per-profile CLIENT membership for this
   workspace's profile) + "Calm Dark" scope wrapper. The shell lives in PortalApp. */
export default async function WorkspaceLayout({ children, params }: {
    children: ReactNode
    params: Promise<{ locale: string; workspaceId: string }>
}) {
    const { workspaceId } = await params
    await getPortalUserId(workspaceId)
    return (
        <div className="portal-calm" style={{ height: '100vh', width: '100%', overflow: 'hidden' }}>
            {children}
        </div>
    )
}
