import { logout } from '@/lib/auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { prisma } from '@/lib/db'
import RoleWatcher from '@/components/RoleWatcher'
import BottomNav from '@/components/BottomNav'
import styles from './dashboard.module.css'

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
        redirect('/api/auth/logout')
    }

    if (user.role === 'ADMIN') {
        redirect('/admin')
    }

    return (
        <div className={styles.dashboardContainer}>
            <RoleWatcher currentRole={user.role} isTreasurer={user.isTreasurer ?? false} />

            {/* --- DESKTOP SIDEBAR --- */}
            <aside className={styles.desktopSidebar}>
                <div style={{ marginBottom: '2rem' }}>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', background: 'linear-gradient(to right, #60a5fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Agency<span style={{ WebkitTextFillColor: 'white' }}>Manager</span>
                    </h1>
                    <div style={{ fontSize: '0.8rem', color: '#888' }}>User Dashboard</div>
                </div>

                <div style={{ flex: 1 }}>
                    {/* User Info Card */}
                    <div className={styles.userCard}>
                        <div className={styles.avatar}>
                            {user.username?.[0]?.toUpperCase()}
                        </div>
                        <div className={styles.userInfo}>
                            <h3>{user.username}</h3>
                            <p className={styles.userRole}>{user.role}</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
                        <span style={{ color: '#888', fontSize: '0.9rem' }}>Uy tín:</span>
                        <span className={styles.reputationBadge}>
                            {user.reputation ?? 100}đ
                        </span>
                    </div>
                </div>

                <div style={{ paddingTop: '1.5rem', borderTop: '1px solid #333' }}>
                    <form action={async () => {
                        'use server'
                        await logout()
                        redirect('/login')
                    }}>
                        <button className={styles.logoutButton}>
                            Đăng xuất
                        </button>
                    </form>
                </div>
            </aside>

            {/* --- MOBILE HEADER --- */}
            <header className={styles.mobileHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h1 style={{ fontWeight: 'bold', fontSize: '1.125rem', background: 'linear-gradient(to right, #60a5fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        AgencyManager
                    </h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span className={styles.reputationBadge}>
                        {user.reputation ?? 100}đ
                    </span>
                    <form action={async () => {
                        'use server'
                        await logout()
                        redirect('/login')
                    }}>
                        <button style={{ color: '#f87171', background: 'transparent', border: 'none', fontWeight: 'bold', fontSize: '0.85rem' }}>
                            Đăng xuất
                        </button>
                    </form>
                </div>
            </header>

            {/* --- MAIN CONTENT --- */}
            <main className={styles.mainContent}>
                {children}
            </main>

            {/* --- BOTTOM NAV (Mobile Only) --- */}
            <BottomNav role={user.role || 'USER'} />
        </div>
    )
}
