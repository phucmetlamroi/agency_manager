import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getWorkspacePrisma, resolveActiveProfileId } from '@/lib/prisma-workspace'
import { getUserPerformanceScore, getStaffErrorLogsDetail } from '@/actions/analytics-actions'
import StaffErrorDetail from '@/components/admin/analytics/StaffErrorDetail'
import { AlertOctagon, ShieldCheck } from 'lucide-react'

export default async function UserErrorsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const session = await getSession()
    if (!session?.user) redirect('/login')

    const { workspaceId } = await params
    const userId = session.user.id

    // [Task-loss A1] Reconcile with the workspace's OWN profile — see resolveActiveProfileId.
    const profileId = await resolveActiveProfileId(userId, workspaceId, session.user.sessionProfileId)
    const workspacePrisma = getWorkspacePrisma(workspaceId, profileId ?? undefined)
    
    const staff = await workspacePrisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, nickname: true, role: true }
    })

    if (!staff) redirect('/login')

    const performance = await getUserPerformanceScore(workspaceId, userId)
    const errorDetails = await getStaffErrorLogsDetail(workspaceId, userId)
    // [BỎ HẠNG S/A/B/C/D 2026-07-31] Xoá khối `errorRate` + `alertConfig` + `isClean`.
    // Ba biến này chấm mức cảnh báo theo tỉ lệ lỗi (xanh / vàng / đỏ) — cùng lớp với luật hạng.
    // Đáng chú ý: chúng vốn đã là MÃ CHẾT từ trước, mỗi tên chỉ xuất hiện đúng một lần trong file
    // (chính dòng khai báo), không có JSX nào đọc tới. Nên xoá không làm mất gì trên màn hình.

    return (
        <div className="max-w-4xl mx-auto space-y-6 p-4 md:p-0">

            {/* ── Page Header ───────────────────────────── */}
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-3">
                    <AlertOctagon className="w-7 h-7 text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]" />
                    <span className="bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
                        Hồ Sơ Vi Phạm Của Bạn
                    </span>
                </h1>
                <p className="text-muted-foreground text-sm mt-1">Danh sách chi tiết các lỗi đã được ghi nhận trong tháng.</p>
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
