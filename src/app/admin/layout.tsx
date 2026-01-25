import { logout } from '@/lib/auth'
import Link from 'next/link'
import '@/app/globals.css'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { prisma } from '@/lib/db'
import RoleWatcher from '@/components/RoleWatcher'
import NotificationBell from '@/components/NotificationBell'

export default async function AdminLayout({
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
        where: { id: session?.user?.id },
        select: { username: true, role: true, reputation: true, isTreasurer: true }
    })

    if (!user) {
        // Cannot set cookies (logout) in Server Component. Redirect to Route Handler instead.
        redirect('/api/auth/logout')
    }

    if (user.role !== 'ADMIN') {
        redirect('/dashboard')
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <RoleWatcher currentRole="ADMIN" />
            <header className="glass-panel" style={{
                height: 'var(--header-height)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 2rem',
                margin: '1rem',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                    <h2 className="title-gradient" style={{ fontSize: '1.5rem' }}>Admin Portal</h2>
                    <nav style={{ display: 'flex', gap: '1rem' }}>
                        <Link href="/admin" className="btn" style={{ color: '#ccc', background: 'transparent' }}>Dashboard</Link>
                        <Link href="/admin/queue" className="btn" style={{ color: '#ccc', background: 'transparent' }}>Kho Task</Link>
                        <Link href="/admin/payroll" className="btn" style={{ color: '#ccc', background: 'transparent' }}>Bảng Lương</Link>
                        <Link href="/admin/finance" className="btn" style={{ color: '#f59e0b', background: 'transparent' }}>Tài Chính</Link>
                        <Link href="/admin/users" className="btn" style={{ color: '#ccc', background: 'transparent' }}>Nhân sự</Link>
                    </nav>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <NotificationBell />

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
                        <span style={{ fontSize: '1.2rem' }}>👤</span>
                        <span>{user.username}</span>
                        {/* Gold Badge for Treasurer */}
                        {user.isTreasurer && (
                            <span title="Thủ Quỹ (Treasurer)" style={{ cursor: 'help' }}>🥇</span>
                        )}
                        <span style={{ fontSize: '0.7rem', background: '#6d28d9', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>Admin</span>
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
