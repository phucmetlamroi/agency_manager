import { logout } from '@/lib/auth'
import Link from 'next/link'
import '@/app/globals.css'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { prisma } from '@/lib/db'
import RoleWatcher from '@/components/RoleWatcher'
import BottomNav from '@/components/BottomNav'

// Revert to Unified Layout (CSS Based Responsive)
// This restores the stability requested by the user.

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

    // Force "desktop" logic for layout shell to ensure it renders everything
    // We handle visibility via CSS (md:flex, hidden etc)

    return (
        <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column', backgroundColor: '#111111', color: 'white' }}>
            {/* Desktop: Use media query logic? Inline styles are hard for media queries.
                We have to force a layout that works. 
                Let's use a standard Sidebar approach but with CSS Module or Global CSS if possible.
                Or just use the Admin style layout which is proven to work.
            */}
            <RoleWatcher currentRole={user.role} isTreasurer={user.isTreasurer ?? false} />

            {/* HEADER (Mobile Logic) - Inline Style doesn't support media queries directly in JSX. 
               We will use a <style> tag or stick to classes if we can fix Tailwind.
               
               WAIT: If Tailwind is broken, 'hidden md:flex' won't work.
               Use specific style blocks.
            */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @media (min-width: 768px) {
                    .desktop-sidebar { display: flex !important; }
                    .mobile-header { display: none !important; }
                    .main-content { margin-left: 256px; }
                }
                @media (max-width: 767px) {
                    .desktop-sidebar { display: none !important; }
                    .mobile-header { display: flex !important; }
                    .main-content { margin-left: 0; }
                }
            `}} />

            {/* Desktop Sidebar */}
            <aside className="desktop-sidebar" style={{
                width: '256px',
                backgroundColor: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(10px)',
                borderRight: '1px solid rgba(255,255,255,0.1)',
                padding: '1.5rem',
                flexDirection: 'column',
                position: 'fixed',
                height: '100%',
                zIndex: 10,
                top: 0,
                left: 0,
                display: 'none' // Default hidden, shown by media query
            }}>
                <div style={{ marginBottom: '2rem' }}>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', background: 'linear-gradient(to right, #60a5fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Agency<span style={{ WebkitTextFillColor: 'white' }}>Manager</span>
                    </h1>
                    <div style={{ fontSize: '0.8rem', color: '#888' }}>User Dashboard</div>
                </div>

                <div style={{ flex: 1 }}>
                    <div style={{ padding: '1rem', borderRadius: '0.75rem', background: 'linear-gradient(to bottom right, rgba(31,41,55,0.5), rgba(17,24,39,0.5))', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                            <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', backgroundColor: '#374151', color: 'white' }}>
                                {user.username?.[0]?.toUpperCase()}
                            </div>
                            <div>
                                <div style={{ fontWeight: 'bold' }}>{user.username}</div>
                                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{user.role}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            <span style={{ color: '#9ca3af' }}>Reputation</span>
                            <span style={{ fontWeight: 'bold', color: (user.reputation || 100) >= 90 ? '#c084fc' : '#facc15' }}>
                                {user.reputation ?? 100}đ
                            </span>
                        </div>
                    </div>
                </div>

                <div style={{ paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <form action={async () => {
                        'use server'
                        await logout()
                        redirect('/login')
                    }}>
                        <button style={{ width: '100%', padding: '0.5rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', borderRadius: '0.5rem', fontWeight: 'bold', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer' }}>
                            Log out
                        </button>
                    </form>
                </div>
            </aside>

            {/* Mobile Header */}
            <header className="mobile-header" style={{
                display: 'none', // Default hidden, shown by media query
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem',
                backgroundColor: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(10px)',
                position: 'sticky',
                top: 0,
                zIndex: 20,
                borderBottom: '1px solid rgba(255,255,255,0.1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h1 style={{ fontWeight: 'bold', fontSize: '1.125rem', background: 'linear-gradient(to right, #60a5fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        AgencyManager
                    </h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: (user.reputation || 100) >= 90 ? '#c084fc' : '#facc15' }}>
                        {user.reputation ?? 100}đ
                    </span>
                    <form action={async () => {
                        'use server'
                        await logout()
                        redirect('/login')
                    }}>
                        <button style={{ fontSize: '0.75rem', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', background: 'transparent' }}>Logout</button>
                    </form>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="main-content" style={{ flex: 1, padding: '1rem', paddingBottom: '6rem', transition: 'all 0.3s' }}>
                {children}
            </main>

            {/* Bottom Navigation */}
            <BottomNav role={user.role || 'USER'} />
        </div>
    )
}
