import { prisma } from '@/lib/db'
import { getSession, logout } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AgencyLayoutShell from '@/components/layout/AgencyLayoutShell'

export default async function AgencyLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await getSession()
    if (!session) redirect('/login')

    // Fetch user and check if they own an agency OR are Admin
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { ownedAgency: true, agency: true }
    })

    if (!user) redirect('/login')

    // Determine Agency Context
    // 1. If User owns an agency, that is their primary agency context.
    // 2. If User is System Admin, they might strictly speaking not own one, but let's allow access if we want? 
    //    Actually, System Admin manages Agencies at /admin/agencies. /agency path is for Agency Admins.
    //    But maybe System Admin wants to "View As"? For now, restrict to Owners.

    // Strict Agency Admin check: Must own an agency.
    const ownedAgency = user.ownedAgency[0]

    if (!ownedAgency && user.role !== 'ADMIN') {
        redirect('/dashboard') // Regular users go to dashboard
    }

    // If Admin doesn't own agency, maybe redirect to /admin?
    if (!ownedAgency && user.role === 'ADMIN') {
        // Allow Admin to view (maybe implicitly pick first one or just show empty?)
        // Ideally Admin creates an agency for themselves if they want to test.
        // For now, let's redirect Admin to /admin if they try to access /agency without owning one.
        redirect('/admin')
    }

    async function handleLogout() {
        'use server'
        await logout()
    }

    return (
        <AgencyLayoutShell user={user} agency={ownedAgency} handleLogout={handleLogout}>
            {children}
        </AgencyLayoutShell>
    )
}
