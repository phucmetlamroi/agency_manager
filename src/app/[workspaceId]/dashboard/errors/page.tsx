import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getUserPerformanceScore, getStaffErrorLogsDetail } from '@/actions/analytics-actions'
import StaffErrorDetail from '@/components/admin/analytics/StaffErrorDetail'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function UserErrorsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const session = await getSession()
    if (!session?.user) redirect('/login')

    const { workspaceId } = await params
    const userId = session.user.id

    const workspacePrisma = getWorkspacePrisma(workspaceId, session.user.sessionProfileId || undefined)
    
    const staff = await workspacePrisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, nickname: true, role: true }
    })

    if (!staff) redirect('/login')

    const performance = await getUserPerformanceScore(workspaceId, userId)
    const errorDetails = await getStaffErrorLogsDetail(workspaceId, userId)

    return (
        <div className="h-full flex flex-col p-4 md:p-8 w-full max-w-[1200px] mx-auto space-y-6">
            <div className="flex flex-col mb-4">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">Hồ Sơ Vi Phạm Của Bạn</h1>
                <p className="text-zinc-400 text-sm mt-1">Danh sách chi tiết các lỗi đã được ghi nhận trong tháng.</p>
            </div>

            <StaffErrorDetail 
                staff={staff} 
                performance={performance} 
                errorDetails={errorDetails} 
                workspaceId={workspaceId} 
                isUserView={true}
            />
        </div>
    )
}
