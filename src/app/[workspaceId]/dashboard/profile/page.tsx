
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import ProfileForm from '@/components/ProfileForm'
import PaymentQrUpload from '@/components/profile/PaymentQrUpload'
import { UserCircle, CreditCard } from 'lucide-react'

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
        <div className="max-w-3xl mx-auto space-y-6">

            {/* ── Page Header ───────────────────────────── */}
            <div>
                <h1 className="text-2xl font-heading font-bold text-zinc-100 flex items-center gap-3">
                    <UserCircle className="w-7 h-7 text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                    Cài đặt cá nhân
                </h1>
                <p className="text-zinc-600 text-sm mt-1">Quản lý thông tin tài khoản và bảo mật của bạn.</p>
            </div>

            {/* ── Profile Info + Password ──────────────── */}
            <ProfileForm user={user} />

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
