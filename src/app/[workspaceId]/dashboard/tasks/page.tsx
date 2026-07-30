// src/app/[workspaceId]/dashboard/tasks/page.tsx
// [P3 / M2.5] Editor "Xem tất cả" spoke — the full task board reached from the
// Today-first home's "Xem tất cả →" link (the home no longer shows the whole board).
// Same data + component the desktop /dashboard uses; USER view (finance fields stripped).
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getWorkspacePrisma, resolveActiveProfileId } from '@/lib/prisma-workspace'
import { serializeDecimal } from '@/lib/serialization'
import { sanitizeTaskListForUser } from '@/lib/task-sanitize'
import UserWorkflowTabs from '@/components/dashboard/UserWorkflowTabs'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DashboardTasksPage({
    params,
    searchParams,
}: {
    params: Promise<{ workspaceId: string }>
    searchParams?: Promise<{ taskId?: string }>
}) {
    const { workspaceId } = await params
    const initialTaskId = (await searchParams)?.taskId || null
    const session = await getSession()
    if (!session) redirect('/login')
    const userId = session.user.id

    const profileId = await resolveActiveProfileId(userId, workspaceId, (session.user as any).sessionProfileId)
    if (!profileId) redirect('/login')
    const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

    const rawTasks = await (workspacePrisma as any).task.findMany({
        where: { assigneeId: userId, isArchived: false },
        include: {
            client: { select: { id: true, name: true, parentId: true, parent: { select: { name: true } } } }, // [AUDIT SWEEP fix] thu hẹp: xem chú thích ở task-detail-loader.ts
            assignee: {
                select: {
                    id: true,
                    username: true,
                    role: true,
                    nickname: true,
                    monthlyRanks: { orderBy: { createdAt: 'desc' }, take: 1, select: { rank: true } },
                },
            },
            taskTags: { include: { tagCategory: { select: { id: true, name: true } } } },
            rawFootage: { select: { displayType: true } },
        },
        orderBy: { createdAt: 'desc' },
    })
    // USER view — strip admin-only financial fields (same hard rule as /dashboard).
    const tasks = sanitizeTaskListForUser(rawTasks, false)

    return (
        <div className="flex flex-col gap-4 pb-10">
            <Link
                href={`/${workspaceId}/dashboard`}
                className="inline-flex w-fit items-center gap-1 text-body-sm text-muted-foreground active:scale-[0.98]"
            >
                <ChevronLeft size={16} /> Trang chủ
            </Link>
            <h1 className="text-page font-semibold text-foreground">Tất cả task của tôi</h1>
            <UserWorkflowTabs
                tasks={serializeDecimal(tasks) as any}
                workspaceId={workspaceId}
                currentUserId={userId}
                initialTaskId={initialTaskId}
            />
        </div>
    )
}
