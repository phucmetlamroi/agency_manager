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
    if (!profileId) redirect('/login')

    const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { username: true }
    })

    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true }
    })

    // Extract targeting month/year from workspace name (format: "04 / 2026")
    let targetMonth = new Date().getMonth() + 1
    let targetYear = new Date().getFullYear()
    
    const monthYearMatch = workspace?.name?.match(/(\d{1,2})\s*\/\s*(\d{4})/)
    if (monthYearMatch) {
        targetMonth = parseInt(monthYearMatch[1])
        targetYear = parseInt(monthYearMatch[2])
    }

    const startOfMonth = new Date(targetYear, targetMonth - 1, 1)
    const endOfMonth = new Date(targetYear, targetMonth, 0, 23, 59, 59)

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
            // For Payroll calculation, MUST filter by workspaceId
            tasks: {
                where: {
                    workspaceId,
                    status: 'Hoàn tất',
                    updatedAt: { gte: startOfMonth, lte: endOfMonth }
                },
                select: { wageVND: true, value: true, status: true }
            },
            payrolls: {
                where: { 
                    workspaceId,
                    month: targetMonth, 
                    year: targetYear 
                }
            },
            profileAccesses: true,
            accessRequests: true
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
