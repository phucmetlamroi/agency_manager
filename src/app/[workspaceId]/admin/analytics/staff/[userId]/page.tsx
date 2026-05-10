import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getUserPerformanceScore, getStaffErrorLogsDetail } from '@/actions/analytics-actions'
import StaffErrorDetail from '@/components/admin/analytics/StaffErrorDetail'
import { verifyWorkspaceAccess } from '@/lib/security'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function StaffAnalyticsDetailPage({ params }: { params: Promise<{ workspaceId: string, userId: string }> }) {
    const { workspaceId, userId } = await params

    // [Sprint J P0] Workspace-scoped guard — replace global-only check.
    try {
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
    } catch {
        redirect(`/${workspaceId}/dashboard`)
    }

    const session = await getSession()
    if (!session?.user) redirect('/login')

    const workspacePrisma = getWorkspacePrisma(workspaceId, session.user.sessionProfileId || undefined)
    
    const staff = await workspacePrisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, nickname: true }
    })

    if (!staff) redirect(`/${workspaceId}/admin/analytics`)

    const performance = await getUserPerformanceScore(workspaceId, userId)
    const errorDetails = await getStaffErrorLogsDetail(workspaceId, userId)

    return (
        <div className="h-full flex flex-col p-6 w-full max-w-[1200px] mx-auto space-y-6">
            <Link href={`/${workspaceId}/admin/analytics`} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors w-fit">
                <ChevronLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Trở về Analytics</span>
            </Link>

            <StaffErrorDetail 
                staff={staff} 
                performance={performance} 
                errorDetails={errorDetails} 
                workspaceId={workspaceId} 
            />
        </div>
    )
}
