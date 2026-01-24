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
        select: { role: true }
    })

    if (!user) redirect('/login')

    if (user.role === 'ADMIN') {
        redirect('/admin') // Admin should go to Admin Dashboard
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <RoleWatcher currentRole={user.role} />
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

                <form action={async () => {
                    'use server'
                    await logout()
                    redirect('/login')
                }}>
                    <button type="submit" className="btn" style={{ border: '1px solid var(--error)', color: 'var(--error)' }}>
                        Đăng xuất
                    </button>
                </form>
            </header>

            <main style={{ flex: 1, padding: '0 1rem 1rem 1rem' }}>
                {children}
            </main>
        </div>
    )
}
