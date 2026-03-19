import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getCurrentUser } from '@/lib/auth-guard'
import { redirect } from 'next/navigation'
import { OptimisticGrid, GridUser, ScheduleItem } from '@/components/schedule/OptimisticGrid'
import { startOfWeek, endOfWeek, eachDayOfInterval, addDays } from 'date-fns'

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

  // Base date (today or from query)
  const baseDate = query?.date ? new Date(query.date) : new Date()

  // Get the full week (Mon–Sun)
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 })
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })

  // Normalize each day to UTC midnight for DB query
  const normalizedDays = weekDays.map(d =>
    new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  )

  const prisma = getWorkspacePrisma(workspaceId)

  // 1. Get all active staff in workspace
  const staffMembers = await prisma.user.findMany({
    where: {
      workspaces: { some: { workspaceId } },
      role: { notIn: ['CLIENT'] }
    },
    select: { id: true, nickname: true, username: true }
  })

  const staffIds = staffMembers.map(s => s.id)

  // 2. Fetch recurring ScheduleRules for all days of this week
  const daysOfWeek = weekDays.map(d => d.getDay()) // [1,2,3,4,5,6,0]
  const rules = await prisma.scheduleRule.findMany({
    where: {
      dayOfWeek: { in: daysOfWeek },
      userId: { in: staffIds },
      isActive: true
    }
  })

  // 3. Fetch ScheduleExceptions for the whole week
  const exceptions = await prisma.scheduleException.findMany({
    where: {
      date: { gte: normalizedDays[0], lte: normalizedDays[6] },
      userId: { in: staffIds }
    }
  })

  // 4. Build GridUser[] with ScheduleItem[] that each have a .date
  const gridUsers: GridUser[] = staffMembers.map(staff => {
    const items: ScheduleItem[] = []

    // Rules: map recurring rules to each matching weekday
    weekDays.forEach(day => {
      const dow = day.getDay()
      const staffRules = rules.filter(r => r.userId === staff.id && r.dayOfWeek === dow)
      staffRules.forEach(r => {
        items.push({
          id: r.id + '_' + day.toISOString(),
          start: r.startTime,
          end: r.endTime,
          reason: 'Lịch cố định',
          type: 'RULE',
          date: day
        })
      })
    })

    // Exceptions: attach real date
    const staffEx = exceptions.filter(e => e.userId === staff.id)
    staffEx.forEach(e => {
      // find matching weekday Date
      const matchDay = weekDays.find(d =>
        d.getDate() === e.date.getUTCDate() &&
        d.getMonth() === e.date.getUTCMonth() &&
        d.getFullYear() === e.date.getUTCFullYear()
      )
      if (!matchDay) return
      items.push({
        id: e.id,
        start: e.startTime,
        end: e.endTime,
        reason: e.reason,
        type: e.type as 'BLOCK' | 'ADD',
        date: matchDay
      })
    })

    return {
      id: staff.id,
      name: staff.nickname || staff.username,
      items
    }
  })

  return (
    <div className="flex-1 space-y-4 p-6 pt-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Lịch điều phối nhân sự</h2>
        <p className="text-sm text-muted-foreground mt-1">Xem và quản lý lịch làm việc của từng nhân sự theo tuần</p>
      </div>

      <div className="bg-card w-full rounded-xl border shadow-sm p-4">
        <OptimisticGrid
          workspaceId={workspaceId}
          date={baseDate}
          users={gridUsers}
        />
      </div>
    </div>
  )
}
