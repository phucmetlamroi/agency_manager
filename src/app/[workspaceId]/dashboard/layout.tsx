
import { logout } from '@/lib/auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { verifyActiveSession } from '@/lib/security'
import { prisma } from '@/lib/db'
import RoleWatcher from '@/components/RoleWatcher'
import BottomNav from '@/components/BottomNav'
import UserTopNav from '@/components/layout/UserTopNav'

// Standardized User Layout (Top Navigation)
// Matches specific stability of Admin Layout

export default async function UserLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ workspaceId: string }>
}) {
    const { workspaceId } = await params
    const { status, session, dbUser } = await verifyActiveSession()

    if (status === 'unauthorized') {
        redirect('/login')
    }

    if (status === 'locked' || !dbUser) {
        // Drop cookie and stop them immediately 
        redirect('/api/auth/logout')
    }

    const { user } = session // To carry over the other JWT fields if needed
    const dbUserRole = dbUser.role

    const headersList = await headers()
    const deviceType = headersList.get('x-device-type') || 'desktop'
    const isMobile = deviceType === 'mobile'

    const handleLogout = async () => {
        'use server'
        await logout()
        redirect('/login') // This redirect happens on server
    }

    if (isMobile) {
        const { default: MobileLayoutShell } = await import('@/components/layout/MobileLayoutShell')
        return (
            <MobileLayoutShell user={user} workspaceId={workspaceId} handleLogout={handleLogout}>
                <RoleWatcher currentRole={dbUserRole} isTreasurer={dbUser.isTreasurer ?? false} />
                {children}
            </MobileLayoutShell>
        )
    }

    /* --- DESKTOP LAYOUT (Top Navigation) --- */
    const displayName = user.nickname || dbUser.username

    return (
        <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
            <RoleWatcher currentRole={dbUserRole} isTreasurer={dbUser.isTreasurer ?? false} />

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

                    {/* Desktop Menu — Lucide Icons with Active State */}
                    <UserTopNav workspaceId={workspaceId} />
                </div>

                {/* RIGHT: User Info & Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {/* User Info Badge */}
                    <Link href={`/${workspaceId}/dashboard/profile`} style={{
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
            <BottomNav role={dbUserRole || 'USER'} workspaceId={workspaceId} />
        </div>
    )
}
