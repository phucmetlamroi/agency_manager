import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import UserPageTabs from '@/components/admin/UserPageTabs'

export default async function AdminUsersPage() {
    const session = await getSession()
    const currentUser = await prisma.user.findUnique({
        where: { id: session?.user?.id },
        select: { username: true }
    })

    const users = await prisma.user.findMany({
        where: currentUser?.username === 'admin' ? {} : { username: { not: 'admin' } },
        orderBy: { username: 'asc' },
        include: { _count: { select: { tasks: true } } }
    })

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <h2 className="title-gradient" style={{ marginBottom: '2rem' }}>Quản lý nhân sự</h2>
            <UserPageTabs users={users} currentUser={currentUser} />
        </div>
    )
}

