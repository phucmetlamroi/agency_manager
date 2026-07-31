// [Giao diện 2 · Mission Control · M15 Hồ sơ cá nhân] Trang hồ sơ của chính user đang đăng nhập.
// MIRROR nguyên composition của /dashboard/profile (AvatarUpload + ProfileForm + NotificationSettings +
// PaymentQrUpload) trong vỏ MC + dải "Chỉ số cá nhân" READ-ONLY (task hoàn tất + rank + lỗi TB, dữ liệu
// thật). Mọi form dùng server action SELF-SERVICE đã hardened IDOR (updateProfile/changePassword/
// uploadAvatar/uploadPaymentQr bám session.user.id — bỏ qua userId client gửi). User là bản ghi GLOBAL
// (bypassModels) → đọc bằng prisma global. KPI workspace-scoped qua getWorkspacePrisma (như M9).
// Admin-gated fail-closed (nhất quán namespace MC; non-admin dùng /dashboard/profile). Đóng → /mc.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, UserCircle, CreditCard, Bell, CheckCircle2 } from 'lucide-react'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import { resolveActiveProfileId, getWorkspacePrisma } from '@/lib/prisma-workspace'
import { prisma } from '@/lib/db'
import { SALARY_COMPLETED_STATUS } from '@/lib/task-statuses'
import ProfileForm from '@/components/ProfileForm'
import PaymentQrUpload from '@/components/profile/PaymentQrUpload'
import AvatarUpload from '@/components/profile/AvatarUpload'
import NotificationSettings from '@/components/profile/NotificationSettings'

export const dynamic = 'force-dynamic'

// [BO HANG S/A/B/C/D 2026-07-31] Bo bang mau hang RANK_HEX.

export default async function MissionControlProfilePage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session?.user?.id) redirect('/login')
    // Namespace MC là cockpit admin → gate nhất quán; hồ sơ hiển thị là của CHÍNH admin (0 rò rỉ).
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } })
    if (!user) redirect('/login')

    // Chỉ số cá nhân READ-ONLY (workspace-scoped): số task hoàn tất.
    // [BỎ HẠNG S/A/B/C/D 2026-07-31] Bỏ `rank` + `errorRate` (đọc từ MonthlyRank) và luôn cả truy
    // vấn `wp.monthlyRank.findFirst` — bảng đó nay không còn được ghi, giữ lại chỉ hiện số đóng băng.
    let completedCount = 0
    const profileId = await resolveActiveProfileId(session.user.id, workspaceId, (session.user as { sessionProfileId?: string }).sessionProfileId)
    if (profileId) {
        const wp = getWorkspacePrisma(workspaceId, profileId)
        completedCount = await wp.task.count({ where: { assigneeId: user.id, workspaceId, status: SALARY_COMPLETED_STATUS } })
    }

    const roleText = ((session.user as { role?: string }).role || user.role || 'USER').toUpperCase()

    return (
        <div style={{ minHeight: '100dvh', background: '#050505', color: '#F4F4F5', position: 'relative', fontFamily: '"Plus Jakarta Sans", -apple-system, "Segoe UI", system-ui, sans-serif' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px 600px at 12% -10%, rgba(99,102,241,0.10), transparent 60%),radial-gradient(800px 600px at 100% 110%, rgba(168,85,247,0.10), transparent 60%)', pointerEvents: 'none' }} />

            {/* Top bar */}
            <div style={{ position: 'sticky', top: 0, zIndex: 10, height: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(10,10,10,0.70)', backdropFilter: 'blur(12px)' }}>
                <Link href={`/${workspaceId}/mc`} title="Về Mission Control" style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#D4D4D8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ArrowLeft style={{ width: 16, height: 16 }} />
                </Link>
                <div style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UserCircle style={{ width: 17, height: 17, color: '#C4B5FD' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', color: '#FFFFFF' }}>Hồ sơ cá nhân</span>
                    <span style={{ fontSize: 11, color: '#A1A1AA' }}>Dùng chung cho mọi workspace của tài khoản · đổi nickname / avatar / mật khẩu</span>
                </div>
            </div>

            {/* Body — mirror /dashboard/profile composition */}
            <div style={{ position: 'relative', padding: '24px 20px 96px' }}>
                <div className="max-w-3xl mx-auto space-y-8">
                    {/* Avatar */}
                    <div className="relative">
                        <div className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/10 blur-[100px] rounded-full pointer-events-none md:block" />
                        <AvatarUpload user={user} />
                    </div>

                    {/* Chỉ số cá nhân (read-only) */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-2xl border border-white/8 bg-zinc-900/60 px-4 py-3.5 flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Task hoàn tất</span>
                            <span className="font-mono text-xl font-extrabold text-white">{completedCount}</span>
                        </div>
                        {/* [BỎ HẠNG S/A/B/C/D 2026-07-31] Bỏ hai ô "Xếp hạng" và "Lỗi trung bình". */}
                    </div>
                    <p className="text-[10.5px] text-zinc-600 -mt-4 px-1">
                        Chỉ số do hệ thống KPI tự đánh giá theo workspace — không sửa tay được · Vai trò: <b className="text-zinc-400">{roleText}</b>
                    </p>

                    <div className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

                    {/* Hồ sơ & Bảo mật */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 px-1">
                            <UserCircle className="w-5 h-5 text-primary-accent" />
                            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Hồ sơ &amp; Bảo mật</h2>
                        </div>
                        <ProfileForm user={user} />
                    </div>

                    {/* Thông báo Email */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 px-1">
                            <Bell className="w-5 h-5 text-violet-400" />
                            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Thông báo Email</h2>
                        </div>
                        <NotificationSettings />
                    </div>

                    {/* Thông tin nhận lương */}
                    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/15 bg-emerald-500/5 backdrop-blur-md shadow-xl shadow-black/30">
                        <div className="absolute -top-10 -left-10 w-40 h-40 bg-emerald-500/6 blur-3xl rounded-full pointer-events-none" />
                        <div className="relative z-10">
                            <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                    <CreditCard className="w-4 h-4 text-emerald-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-zinc-200 text-sm">Thông tin nhận lương</h3>
                                    <p className="text-muted-foreground text-xs">Cập nhật tài khoản ngân hàng để nhận thanh toán lương.</p>
                                </div>
                            </div>
                            <div className="px-6 py-5">
                                <PaymentQrUpload user={user} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
