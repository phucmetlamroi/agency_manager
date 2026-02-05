import { logout } from '@/lib/auth'
import Link from 'next/link'
// Removed duplicate globals.css import
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { prisma } from '@/lib/db'
import RoleWatcher from '@/components/RoleWatcher'
import NotificationBell from '@/components/NotificationBell'
import { AdminShell } from '@/components/layout/AdminShell'

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
        <AdminShell user={user}>
            <RoleWatcher currentRole="ADMIN" isTreasurer={user.isTreasurer} />
            {children}
        </AdminShell>
    )
}
