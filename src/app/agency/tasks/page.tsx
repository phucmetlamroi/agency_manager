import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AgencyTaskTable from '@/components/agency/AgencyTaskTable' // New component

export const dynamic = 'force-dynamic'

export default async function AgencyTasksPage() {
    const session = await getSession()
    if (!session) redirect('/login')

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { ownedAgency: true }
    })

    // Check permission logic again (similar to layout, double check safe)
    const agency = user?.ownedAgency[0]
    if (!agency) redirect('/dashboard')

    // Fetch Tasks assigned to this Agency
    const tasks = await prisma.task.findMany({
        where: {
            assignedAgencyId: agency.id
        },
        include: {
            assignee: true,
            client: true
        },
        orderBy: { createdAt: 'desc' }
    })

    // Fetch Agency Members for assignment
    const members = await prisma.user.findMany({
        where: { agencyId: agency.id },
        select: { id: true, username: true, nickname: true, reputation: true }
    })

    return (
        <div className="max-w-[1600px] mx-auto">
            <h2 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Kho Việc Đại Lý (Task Pool)
            </h2>

            <AgencyTaskTable tasks={tasks as any} members={members} />
        </div>
    )
}
