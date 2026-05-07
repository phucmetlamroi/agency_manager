
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import ProfileForm from '@/components/ProfileForm'
import PaymentQrUpload from '@/components/profile/PaymentQrUpload'
import AvatarUpload from '@/components/profile/AvatarUpload'
import NotificationSettings from '@/components/profile/NotificationSettings'
import { UserCircle, CreditCard, ShieldCheck, Bell } from 'lucide-react'

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
        <div className="max-w-3xl mx-auto space-y-10 pb-20 pt-4">

            {/* ── Page Header ───────────────────────────── */}
            <div className="text-center space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[11px] font-bold uppercase tracking-wider mb-2">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Account Settings
                </div>
                <h1 className="text-3xl font-black text-white italic tracking-tighter">
                    THÔNG TIN CÁ NHÂN
                </h1>
                <p className="text-zinc-500 text-sm max-w-sm mx-auto font-medium">Quản lý hồ sơ, bảo mật và thông tin thanh toán của bạn.</p>
            </div>

            {/* ── Avatar Section ── */}
            <div className="relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />
                <AvatarUpload user={user} />
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

            {/* ── Profile Info + Password ──────────────── */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <UserCircle className="w-5 h-5 text-indigo-400" />
                    <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Hồ sơ & Bảo mật</h2>
                </div>
                <ProfileForm user={user} />
            </div>

            {/* ── Notification Settings ──────────────────── */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Bell className="w-5 h-5 text-violet-400" />
                    <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Thong bao Email</h2>
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
                            <p className="text-zinc-600 text-xs">Cập nhật tài khoản ngân hàng để nhận thanh toán lương.</p>
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
