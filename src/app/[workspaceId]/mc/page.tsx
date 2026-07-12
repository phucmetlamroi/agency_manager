// [Giao diện 2 · Mission Control] Full-screen alternate admin UI, mounted OUTSIDE /admin so it renders
// its OWN shell (rail + topbar) instead of inheriting the current admin AppShell — Giao diện 1 (/admin)
// stays byte-identical. Reachable at /[workspaceId]/mc. The avatar-menu "Đổi giao diện 1 ⇄ 2" toggle
// (a persisted user preference) + real data wiring land in the next commits; this first commit is the
// pixel-faithful M1 Tổng quan render from the owner's Claude Design bundle.
import { verifyActiveSession } from '@/lib/security'
import { redirect } from 'next/navigation'
import MissionControlBoard from '@/components/mission-control/MissionControlBoard'

export const dynamic = 'force-dynamic'

export default async function MissionControlPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    await params
    const { status, dbUser } = await verifyActiveSession()
    if (status === 'unauthorized' || !dbUser) redirect('/login')
    if (status === 'locked') redirect('/api/auth/logout')
    return <MissionControlBoard />
}
