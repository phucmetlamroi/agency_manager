// [Giao diện 2 · Mission Control · M3 Task Drawer] Deep-link route for the MC task drawer.
// Board clicks now open the drawer AS AN OVERLAY over the real board (McKanban host, no
// navigation — owner's 2026-07-14 review); this page remains for direct URLs / refresh /
// share-links and renders the same drawer over the design's static backdrop. Data comes from
// the SHARED builder (loadTaskDetail sanitizer + vetted getTaskAssets for the review states).
// Admin-gated like the other MC screens. Full editing bridges to the Giao diện 1 drawer.
import { redirect, notFound } from 'next/navigation'
import { verifyProfileAdminAccess } from '@/lib/security'
import { buildMcTaskDrawerData } from '@/lib/mc-task-drawer-data'
import McTaskDrawer from '@/components/mission-control/McTaskDrawer'

export const dynamic = 'force-dynamic'

export default async function MissionControlTaskDrawerPage({ params }: { params: Promise<{ workspaceId: string; taskId: string }> }) {
    const { workspaceId, taskId } = await params

    // Admin-gate like the other MC screens (MC surfaces wages/KPIs).
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    const res = await buildMcTaskDrawerData(workspaceId, taskId)
    if (res.kind === 'redirect') redirect(res.to)
    if (res.kind === 'notFound') notFound()

    return <McTaskDrawer detail={res.detail} workspaceId={workspaceId} fullEditHref={`/${workspaceId}/task/${taskId}`} />
}
