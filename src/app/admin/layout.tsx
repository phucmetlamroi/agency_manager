import { logout } from '@/lib/auth'
import Link from 'next/link'
import '@/app/globals.css'
import { redirect } from 'next/navigation'

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
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
                        <Link href="/admin" className="btn" style={{ color: '#ccc', background: 'transparent' }}>Tasks</Link>
                        <Link href="/admin/users" className="btn" style={{ color: '#ccc', background: 'transparent' }}>Users</Link>
                    </nav>
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
