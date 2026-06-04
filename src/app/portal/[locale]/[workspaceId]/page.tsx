import { redirect } from 'next/navigation'
import { getSession as getAuthSession } from '@/lib/auth'
import { getClientTasks, getClientInvoices, getClientWorkspaces, getPortalUserId } from '@/actions/client-portal-actions'
import { localizeWorkspaceName } from '@/lib/workspace-name'
import { getMyProfilesAndWorkspaces } from '@/actions/profile-actions'
import { deriveAccountName } from '@/components/portal/calm/types'
import type { Deliverable, Invoice, SurfaceId } from '@/components/portal/calm/types'
import PortalApp from '@/components/portal/calm/PortalApp'

export const dynamic = 'force-dynamic'

/* Client Portal — single "Calm Dark" SPA: Overview · Deliverables · Invoices. */
export default async function PortalHome({ params, searchParams }: {
    params: Promise<{ locale: string; workspaceId: string }>
    searchParams: Promise<{ s?: string }>
}) {
    const { locale, workspaceId } = await params
    const { s } = await searchParams
    const session = await getAuthSession()
    if (!session?.user?.id) redirect('/login')
    // [Client membership] legacy global CLIENT or per-profile CLIENT for this workspace.
    await getPortalUserId(workspaceId)

    const [rawDel, rawInv, workspaces] = await Promise.all([
        getClientTasks(workspaceId),
        getClientInvoices(workspaceId),
        getClientWorkspaces(),
    ])
    // Round-trip → plain objects + ISO-string dates for the client surfaces.
    const deliverables = JSON.parse(JSON.stringify(rawDel)) as Deliverable[]
    const invoices = JSON.parse(JSON.stringify(rawInv)) as Invoice[]
    const myPW = await getMyProfilesAndWorkspaces()

    const ws = workspaces.find(w => w.id === workspaceId)
    const agencyName = localizeWorkspaceName(ws?.name || workspaceId, locale)
    const contactName = session.user.username || 'Client'
    const accountName = deriveAccountName(deliverables, agencyName)
    const initialSurface: SurfaceId = s === 'deliverables' || s === 'invoices' ? s : 'overview'

    return (
        <PortalApp
            workspaceId={workspaceId}
            locale={locale}
            currentUserId={session.user.id}
            accountName={accountName}
            contactName={contactName}
            agencyName={agencyName}
            initialDeliverables={deliverables}
            initialInvoices={invoices}
            initialSurface={initialSurface}
            profiles={myPW.profiles.map((p: any) => ({ id: p.id, name: p.name }))}
            switcherWorkspaces={myPW.workspaces.map((w: any) => ({ id: w.id, name: w.name }))}
            currentProfileId={myPW.currentProfileId}
        />
    )
}
