
import { logout } from '@/lib/auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { prisma } from '@/lib/db'
import RoleWatcher from '@/components/RoleWatcher'
import BottomNav from '@/components/BottomNav'

// Standardized User Layout (Top Navigation)
// Matches specific stability of Admin Layout

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
        select: { role: true, username: true, nickname: true, reputation: true, isTreasurer: true }
    })

    if (!user) {
        redirect('/api/auth/logout')
    }

    const headersList = await headers()
    const deviceType = headersList.get('x-device-type') || 'desktop'
    const isMobile = deviceType === 'mobile'

    const handleLogout = async () => {
        'use server'
        await logout()
        redirect('/login') // This redirect happens on server
    }

    /* --- MOBILE LAYOUT --- */
    if (isMobile) {
        const { default: MobileLayoutShell } = await import('@/components/layout/MobileLayoutShell')
        return (
            <MobileLayoutShell user={user} handleLogout={handleLogout}>
                <RoleWatcher currentRole={user.role} isTreasurer={user.isTreasurer ?? false} />
                {children}
            </MobileLayoutShell>
        )
    }

    /* --- DESKTOP LAYOUT (Top Navigation) --- */
    const displayName = user.nickname || user.username

    return (
        <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
            <RoleWatcher currentRole={user.role} isTreasurer={user.isTreasurer ?? false} />

            {/* --- TOP NAVIGATION BAR (Matches Admin) --- */}
            <header className="glass-panel" style={{
                height: 'var(--header-height)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 1rem', // Smaller padding for mobile friendliness
                margin: '1rem',
                justifyContent: 'space-between'
            }}>
                {/* LEFT: Branding */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h1 style={{
                        fontSize: '1.25rem',
                        fontWeight: 'bold',
                        background: 'linear-gradient(to right, #60a5fa, #c084fc)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent'
                    }}>
                        Agency<span style={{ WebkitTextFillColor: 'white' }}>Manager</span>
                    </h1>

                    {/* Desktop Menu - Hidden on Mobile */}
                    <nav className="desktop-menu" style={{ display: 'none', gap: '1rem', marginLeft: '2rem' }}>
                        <style dangerouslySetInnerHTML={{
                            __html: `
                            @media (min-width: 768px) {
                                .desktop-menu { display: flex !important; }
                            }
                        `}} />
                        <Link href="/dashboard" className="btn" style={{ color: '#ccc', background: 'transparent', padding: '0.5rem 1rem' }}>Tổng quan</Link>
                        <Link href="/dashboard/schedule" className="btn" style={{ color: '#c084fc', background: 'transparent', padding: '0.5rem 1rem' }}>Lịch làm việc</Link>
                        <Link href="/dashboard/profile" className="btn" style={{ color: '#ccc', background: 'transparent', padding: '0.5rem 1rem' }}>Hồ sơ</Link>
                    </nav>
                </div>

                {/* RIGHT: User Info & Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {/* User Info Badge */}
                    <Link href="/dashboard/profile" style={{
                        fontSize: '0.85rem', color: '#ccc',
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
                        textDecoration: 'none',
                        cursor: 'pointer'
                    }}>
                        <div style={{ width: '24px', height: '24px', background: '#6d28d9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '10px' }}>
                            {displayName?.[0]?.toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600 }}>{displayName}</span>
                        <span style={{ color: '#444' }}>|</span>
                        <span style={{
                            fontWeight: 'bold',
                            color: (user.reputation || 100) >= 90 ? '#a855f7' : '#facc15'
                        }}>
                            {user.reputation ?? 100}đ
                        </span>
                    </Link>

                    <form action={handleLogout}>
                        <button style={{
                            color: '#f87171',
                            background: 'transparent',
                            border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}>
                            Logout
                        </button>
                    </form>
                </div>
            </header>

            {/* --- MAIN CONTENT --- */}
            <main style={{ flex: 1, padding: '0 1rem 1rem 1rem', paddingBottom: '6rem' }}>
                {children}
            </main>

            {/* --- BOTTOM NAV (Mobile Only - Fallback if not Shell) --- */}
            <BottomNav role={user.role || 'USER'} />
        </div>
    )
}
