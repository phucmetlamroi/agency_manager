import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getCurrentUser } from '@/lib/auth-guard'
import { redirect } from 'next/navigation'
import { OptimisticGrid, GridUser, ScheduleItem } from '@/components/schedule/OptimisticGrid'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

export default async function AdminSchedulePage({
  params,
  searchParams
}: {
  params: Promise<{ workspaceId: string }>
  searchParams?: Promise<{ date?: string }>
}) {
  const { workspaceId } = await params
  const query = await searchParams
  const user = await getCurrentUser()
  
  if (!user || user.role === 'CLIENT') redirect(`/${workspaceId}/dashboard`)

  // Parse date or use today
  const targetDate = query?.date ? new Date(query.date) : new Date()
  const normalizedDateStr = format(targetDate, 'yyyy-MM-dd')
  const normalizeDate = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()))
  const dayOfWeek = targetDate.getUTCDay()

  const prisma = getWorkspacePrisma(workspaceId)

  // 1. Get all active staff
  const staffMembers = await prisma.user.findMany({
    where: {
      role: { in: ['USER', 'ADMIN', 'AGENCY_ADMIN'] },
      workspaces: { some: { workspaceId } }
    },
    select: { id: true, nickname: true, username: true }
  })

  // 2. Fetch Rules & Exceptions for this specific date
  const rules = await prisma.scheduleRule.findMany({
    where: { 
      dayOfWeek,
      userId: { in: staffMembers.map(s => s.id) }
    }
  })

  const exceptions = await prisma.scheduleException.findMany({
    where: {
      date: normalizeDate,
      userId: { in: staffMembers.map(s => s.id) }
    }
  })

  // 3. Transform to GridUser format
  const gridUsers: GridUser[] = staffMembers.map(staff => {
    const items: ScheduleItem[] = []
    
    // Add Rules
    const staffRules = rules.filter(r => r.userId === staff.id)
    staffRules.forEach(r => items.push({ id: r.id, start: r.startTime, end: r.endTime, reason: 'Lịch cố định', type: 'RULE' }))

    // Add Exceptions
    const staffEx = exceptions.filter(e => e.userId === staff.id)
    staffEx.forEach(e => items.push({ id: e.id, start: e.startTime, end: e.endTime, reason: e.reason, type: e.type as "BLOCK" | "ADD" }))

    return {
      id: staff.id,
      name: staff.nickname || staff.username,
      items
    }
  })

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Lịch điều phối nhân sự</h2>
      </div>
      <p className="text-muted-foreground">
        Ngày đang xem: <span className="font-semibold text-foreground">{normalizedDateStr}</span>
      </p>

      <div className="bg-card w-full rounded-lg border shadow-sm p-4 mt-6">
        <OptimisticGrid 
          workspaceId={workspaceId} 
          date={normalizeDate}
          users={gridUsers}
        />
      </div>

    </div>
  )
}
