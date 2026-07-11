
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import ProfileForm from '@/components/ProfileForm'
import PaymentQrUpload from '@/components/profile/PaymentQrUpload'
import AvatarUpload from '@/components/profile/AvatarUpload'
import NotificationSettings from '@/components/profile/NotificationSettings'
import { UserCircle, CreditCard, Bell } from 'lucide-react'

export default async function ProfilePage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('session')

    if (!sessionCookie) redirect('/login')

    const session = await decrypt(sessionCookie.value)
    if (!session?.user?.id) redirect('/login')

    const user = await prisma.user.findUnique({
        where: { id: session.user.id }
    })

    if (!user) redirect('/login')

    return (
        <div className="max-w-3xl mx-auto space-y-8 pb-24 pt-2">

            {/* [M10/FR-F3.1/FR-F3.2] Hero ALL-CAPS "THÔNG TIN CÁ NHÂN" (tiêu đề lặp, chiếm trọn
                màn đầu — f_0089/f_0106) đã xóa cả desktop lẫn mobile. Vào thẳng avatar row gọn. */}

            {/* ── Avatar Section ── */}
            <div className="relative">
                {/* Ambient orb: chỉ desktop (QĐ-11 — ngân sách blur mobile) */}
                <div className="absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/10 blur-[100px] rounded-full pointer-events-none md:block" />
                <AvatarUpload user={user} />
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

            {/* ── Profile Info + Password ──────────────── */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <UserCircle className="w-5 h-5 text-primary-accent" />
                    <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Hồ sơ & Bảo mật</h2>
                </div>
                <ProfileForm user={user} />
            </div>

            {/* ── Notification Settings ──────────────────── */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Bell className="w-5 h-5 text-violet-400" />
                    <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Thông báo Email</h2>
                </div>
                <NotificationSettings />
            </div>

            {/* ── Payment / QR Info ─────────────────────── */}
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
    )
}
