import { logout } from '@/lib/auth'
import Link from 'next/link'
import '@/app/globals.css'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { prisma } from '@/lib/db'
import RoleWatcher from '@/components/RoleWatcher'
import BottomNav from '@/components/BottomNav'

export default async function UserLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('session')

    if (!sessionCookie) redirect('/login')

    const session = await decrypt(sessionCookie.value)
    if (!session?.user?.id) redirect('/login')

    // Fetch fresh role from DB
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true, username: true, reputation: true, isTreasurer: true }
    })

    if (!user) {
        // Cannot set cookies (logout) in Server Component. Redirect to Route Handler instead.
        redirect('/api/auth/logout')
    }

    if (user.role === 'ADMIN') {
        redirect('/admin') // Admin should go to Admin Dashboard
    }

    return (
        <div className="flex min-h-screen flex-col md:flex-row bg-[#111111] text-white">
            <RoleWatcher currentRole={user.role} isTreasurer={user.isTreasurer ?? false} />

            {/* Desktop Sidebar - HIDDEN ON MOBILE */}
            <aside className="w-64 bg-black/40 backdrop-blur-xl border-r border-white/10 p-6 hidden md:flex flex-col fixed h-full z-10 top-0 left-0">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        Agency<span className="text-white">Manager</span>
                    </h1>
                    <div style={{ fontSize: '0.8rem', color: '#888' }}>User Dashboard</div>
                </div>

                <div className="flex-1 space-y-4">
                    {/* User Info Card */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-white/5">
                        <div className="flex items-center gap-3 mb-2">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg bg-gray-700 text-white`}>
                                {user.username?.[0]?.toUpperCase()}
                            </div>
                            <div>
                                <div className="font-bold">{user.username}</div>
                                <div className="text-xs text-gray-400">{user.role}</div>
                            </div>
                        </div>
                        <div className="flex justify-between items-center text-sm pt-2 border-t border-white/10">
                            <span className="text-gray-400">Reputation</span>
                            <span className={`font-bold ${(user.reputation || 100) >= 90 ? 'text-purple-400' : 'text-yellow-400'}`}>
                                {user.reputation ?? 100}đ
                            </span>
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-white/10">
                    <form action={async () => {
                        'use server'
                        await logout()
                        redirect('/login')
                    }}>
                        <button className="w-full py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 text-sm font-bold border border-red-500/20 transition-all">
                            Log out
                        </button>
                    </form>
                </div>
            </aside>

            {/* Mobile Header - VISIBLE ON MOBILE ONLY */}
            <header className="md:hidden flex items-center justify-between p-4 bg-black/60 backdrop-blur-md sticky top-0 z-20 border-b border-white/10">
                <div className="flex items-center gap-2">
                    <h1 className="font-bold text-lg bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        AgencyManager
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${(user.reputation || 100) >= 90 ? 'text-purple-400' : 'text-yellow-400'}`}>
                        {user.reputation ?? 100}đ
                    </span>
                    <form action={async () => {
                        'use server'
                        await logout()
                        redirect('/login')
                    }}>
                        <button className="text-xs text-red-400 border border-red-500/30 px-2 py-1 rounded">Logout</button>
                    </form>
                </div>
            </header>

            {/* Main Content Area */}
            {/* Added pb-20 for mobile bottom nav spacing, md:ml-64 for desktop sidebar offset */}
            <main className="flex-1 md:ml-64 p-4 pb-24 md:p-8 transition-all duration-300">
                {children}
            </main>

            {/* Bottom Navigation - MOBILE ONLY */}
            <BottomNav role={user.role || 'USER'} />
        </div>
    )
}
