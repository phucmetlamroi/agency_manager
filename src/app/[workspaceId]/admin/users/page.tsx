import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import UserPageTabs from '@/components/admin/UserPageTabs'
import { serializeDecimal } from '@/lib/serialization'

export default async function AdminUsersPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    const profileId = (session.user as any).sessionProfileId
    if (!profileId) redirect('/profile')

    const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { username: true }
    })

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    const users = await prisma.user.findMany({
        where: {
            OR: [
                { profileId: profileId },
                { profileAccesses: { some: { profileId: profileId } } }
            ],
            ...(currentUser?.username === 'admin' ? {} : { username: { not: 'admin' } })
        },
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
            profileAccesses: true,
            accessRequests: true,
            // @ts-ignore
            avatarUrl: true
        }
    })

    // Fetch ALL Profiles so admin can send users to other teams
    const profiles = await prisma.profile.findMany({ 
        select: { 
            id: true, 
            name: true, 
            bannerUrl: true, 
            logoUrl: true,
            _count: { select: { users: true } }
        }, 
        orderBy: { name: 'asc' } 
    })

    // Lấy danh sách yêu cầu "Du học" (Những người từ team khác xin vào team của Admin này)
    const incomingRequests = await prisma.profileAccessRequest.findMany({
        where: { targetProfileId: profileId, status: 'PENDING' },
        include: {
            user: { select: { id: true, username: true, nickname: true, email: true } },
            requestedBy: { select: { id: true, username: true } }
        },
        orderBy: { createdAt: 'desc' }
    })

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <h2 className="title-gradient" style={{ marginBottom: '2rem' }}>Staff Management</h2>
            <UserPageTabs 
                users={serializeDecimal(users)} 
                currentUser={currentUser} 
                profiles={profiles} 
                incomingRequests={incomingRequests}
                workspaceId={workspaceId} 
            />
        </div>
    )
}
