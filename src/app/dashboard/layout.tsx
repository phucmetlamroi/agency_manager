import { logout } from '@/lib/auth'
import '@/app/globals.css'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isMobileDevice } from '@/lib/device'

import DesktopLayoutShell from '@/components/layout/DesktopLayoutShell'
import MobileLayoutShell from '@/components/layout/MobileLayoutShell'
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
        redirect('/api/auth/logout')
    }

    if (user.role === 'ADMIN') {
        redirect('/admin')
    }

    const isMobile = await isMobileDevice()

    async function handleLogout() {
        'use server'
        await logout()
        redirect('/login')
    }

    // Role Watcher is logic only, can stay outside shells? 
    // Or render inside? Better inside to ensure providers/context works if needed.
    // For now simple rendering.

    return (
        <>
            <RoleWatcher currentRole={user.role} isTreasurer={user.isTreasurer ?? false} />

            {isMobile ? (
                <MobileLayoutShell user={user} handleLogout={handleLogout}>
                    {children}
                </MobileLayoutShell>
            ) : (
                <DesktopLayoutShell user={user} handleLogout={handleLogout}>
                    {children}
                </DesktopLayoutShell>
            )}
        </>
    )
}
