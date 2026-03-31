import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getUserPerformanceScore, getStaffErrorLogsDetail } from '@/actions/analytics-actions'
import StaffErrorDetail from '@/components/admin/analytics/StaffErrorDetail'
import { AlertOctagon, ShieldCheck } from 'lucide-react'

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
    const errorRate = performance?.errorRate ?? 0

    // Determine alert level
    const isClean = !errorDetails || errorDetails.length === 0
    const alertConfig = errorRate < 0.6
        ? { border: 'border-emerald-500/25', glow: 'from-emerald-500/15 to-transparent', title: 'text-emerald-400', text: 'Tiêu đề hoàn hảo!' }
        : errorRate < 1.0
        ? { border: 'border-amber-500/30', glow: 'from-amber-500/10 to-transparent', title: 'text-amber-400', text: 'Cảnh báo — cần chú ý!' }
        : { border: 'border-red-500/30', glow: 'from-red-500/10 to-transparent', title: 'text-red-400', text: 'Cần cải thiện ngay!' }

    return (
        <div className="max-w-4xl mx-auto space-y-6 p-4 md:p-0">

            {/* ── Page Header ───────────────────────────── */}
            <div>
                <h1 className="text-2xl font-heading font-bold flex items-center gap-3">
                    <AlertOctagon className="w-7 h-7 text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]" />
                    <span className="bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
                        Hồ Sơ Vi Phạm Của Bạn
                    </span>
                </h1>
                <p className="text-zinc-500 text-sm mt-1">Danh sách chi tiết các lỗi đã được ghi nhận trong tháng.</p>
            </div>

            {/* ── StaffErrorDetail Component ──────────── */}
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
