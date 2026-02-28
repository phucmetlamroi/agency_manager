import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TaskTable from '@/components/TaskTable'
import ArchiveManager from '@/components/admin/ArchiveManager'

export default async function ArchivePage() {
    const session = await getSession()
    if (!session || session.user.role !== 'ADMIN') redirect('/login')

    const tasks = await prisma.task.findMany({
        where: { isArchived: true },
        include: {
            assignee: true,
            client: {
                include: { parent: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    })

    const users = await prisma.user.findMany({
        orderBy: { username: 'asc' },
        include: { ownedAgency: true }
    })

    const agencies = await prisma.agency.findMany({
        select: { id: true, name: true, code: true }
    })

    // To comply with TaskTable serialization requirements
    const serializedTasks = tasks.map(t => ({
        ...t,
        value: Number(t.value),
        jobPriceUSD: Number(t.jobPriceUSD || 0),
        wageVND: Number(t.wageVND || 0),
        exchangeRate: Number(t.exchangeRate || 25300),
        profitVND: Number(t.profitVND || 0)
    }))

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div className="flex flex-col gap-2 mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-white title-gradient">Archive</h1>
                <p className="text-muted-foreground">Lưu trữ và xem lại các task cũ đã hoàn thành.</p>
            </div>

            <ArchiveManager />

            <div className="glass-panel p-6 border border-zinc-800 rounded-xl">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span>📦</span> Kho Dữ Liệu Lịch Sử
                    </h2>
                    <span className="bg-zinc-800 text-zinc-300 px-3 py-1 rounded-full text-sm font-medium">
                        {tasks.length} tasks
                    </span>
                </div>

                {tasks.length > 0 ? (
                    <TaskTable
                        tasks={serializedTasks as any}
                        isAdmin={true}
                        users={users}
                        agencies={agencies}
                    />
                ) : (
                    <div className="text-center py-16 text-zinc-500 italic border border-dashed border-zinc-800 rounded-xl bg-zinc-900/50">
                        Chưa có task nào được lưu trữ.
                    </div>
                )}
            </div>
        </div>
    )
}
