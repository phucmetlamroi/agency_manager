import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import UserPageTabs from '@/components/admin/UserPageTabs'

export default async function AdminUsersPage() {
    const session = await getSession()
    const currentUser = await prisma.user.findUnique({
        where: { id: session?.user?.id },
        select: { username: true }
    })

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    const users = await prisma.user.findMany({
        where: currentUser?.username === 'admin' ? {} : { username: { not: 'admin' } },
        orderBy: { username: 'asc' },
        include: {
            _count: { select: { tasks: true } },
            // For Payroll
            tasks: {
                where: {
                    status: 'Hoàn tất',
                    updatedAt: { gte: startOfMonth, lte: endOfMonth }
                },
                select: { wageVND: true, value: true, status: true }
            },
            payrolls: {
                where: { month, year }
            },
            ownedAgency: true, // Fetch owned agencies
            agency: true // Fetch assigned agency
        }
    })

    // Fetch Agencies for selection
    const agencies = await prisma.agency.findMany({ select: { id: true, name: true, code: true } })

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <h2 className="title-gradient" style={{ marginBottom: '2rem' }}>Quản lý nhân sự</h2>
            <UserPageTabs users={users} currentUser={currentUser} agencies={agencies} />
        </div>
    )
}

