import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getCurrentUser } from '@/lib/auth-guard'
import { redirect } from 'next/navigation'
import { OptimisticGrid, GridUser, ScheduleItem } from '@/components/schedule/OptimisticGrid'
import { startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns'

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

  const baseDate = query?.date ? new Date(query.date) : new Date()
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 })
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })

  const normalizedDays = weekDays.map(d =>
    new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  )

  const prisma = getWorkspacePrisma(workspaceId)

  // Fetch all workspace members via WorkspaceMember join table, excluding CLIENT role
  const workspaceMembers = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: {
      user: {
        select: { id: true, nickname: true, username: true, role: true }
      }
    }
  })

  const staffMembers = workspaceMembers
    .map(m => m.user)
    .filter(u => u.role !== 'CLIENT')

  const staffIds = staffMembers.map(s => s.id)

  const daysOfWeek = weekDays.map(d => d.getDay())

  // Fetch ScheduleRules for the full week
  const rules = await prisma.scheduleRule.findMany({
    where: {
      dayOfWeek: { in: daysOfWeek },
      userId: { in: staffIds },
      isActive: true
    }
  })

  // Fetch ScheduleExceptions for the full week
  const exceptions = await prisma.scheduleException.findMany({
    where: {
      date: { gte: normalizedDays[0], lte: normalizedDays[6] },
      userId: { in: staffIds }
    }
  })

  // Build GridUser[] with date-enriched ScheduleItems
  const gridUsers: GridUser[] = staffMembers.map(staff => {
    const items: ScheduleItem[] = []

    weekDays.forEach(day => {
      const dow = day.getDay()
      rules.filter(r => r.userId === staff.id && r.dayOfWeek === dow).forEach(r => {
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

    exceptions.filter(e => e.userId === staff.id).forEach(e => {
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
        <p className="text-sm text-muted-foreground mt-1">
          Xem lịch làm việc của từng nhân sự theo tuần — chỉ nhân sự tự đăng ký lịch của mình
        </p>
      </div>

      {gridUsers.length === 0 ? (
        <div className="flex items-center justify-center h-48 border border-dashed border-border rounded-xl text-muted-foreground text-sm">
          Chưa có nhân sự nào trong workspace này.
        </div>
      ) : (
        <div className="bg-card w-full rounded-xl border shadow-sm p-4">
          <OptimisticGrid
            workspaceId={workspaceId}
            date={baseDate}
            users={gridUsers}
            readOnly={true}
          />
        </div>
      )}
    </div>
  )
}
