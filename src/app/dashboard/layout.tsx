import { logout } from '@/lib/auth'
import Link from 'next/link'
import '@/app/globals.css'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { prisma } from '@/lib/db'
import RoleWatcher from '@/components/RoleWatcher'

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
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <RoleWatcher currentRole={user.role} isTreasurer={user.isTreasurer ?? false} />
            <header className="glass-panel" style={{
                height: 'var(--header-height)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 2rem',
                margin: '1rem',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                    <h2 className="title-gradient" style={{ fontSize: '1.5rem' }}>My Dashboard</h2>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        fontSize: '0.9rem', color: '#ccc',
                        borderRight: '1px solid #444', paddingRight: '1rem',
                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}>
                        <div style={{ marginRight: '0.5rem', textAlign: 'right' }}>
                            <div style={{ fontSize: '0.8rem', color: '#888' }}>Uy tín</div>
                            <div style={{
                                fontWeight: 'bold',
                                color: (user.reputation || 100) >= 90 ? '#a855f7' : (user.reputation || 100) < 50 ? '#eab308' : '#fff'
                            }}>
                                {user.reputation ?? 100}đ
                            </div>
                        </div>
                        <span style={{ fontSize: '1.2rem' }}>👋</span>
                        {user.username}
                    </div>

                    <form action={async () => {
                        'use server'
                        await logout()
                        redirect('/login')
                    }}>
                        <button type="submit" className="btn" style={{ border: '1px solid var(--error)', color: 'var(--error)' }}>
                            Đăng xuất
                        </button>
                    </form>
                </div>
            </header>

            <main style={{ flex: 1, padding: '0 1rem 1rem 1rem' }}>
                {children}
            </main>
        </div>
    )
}
