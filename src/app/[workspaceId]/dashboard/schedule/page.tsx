import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getCurrentUser } from '@/lib/auth-guard'
import { redirect } from 'next/navigation'
import { OptimisticGrid, GridUser, ScheduleItem } from '@/components/schedule/OptimisticGrid'
import { startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns'

export const dynamic = 'force-dynamic'

export default async function UserSchedulePage({
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
  const daysOfWeek = weekDays.map(d => d.getDay())

  const rules = await prisma.scheduleRule.findMany({
    where: { dayOfWeek: { in: daysOfWeek }, userId: user.id, isActive: true }
  })

  const exceptions = await prisma.scheduleException.findMany({
    where: {
      date: { gte: normalizedDays[0], lte: normalizedDays[6] },
      userId: user.id
    }
  })

  const items: ScheduleItem[] = []

  weekDays.forEach(day => {
    const dow = day.getDay()
    rules.filter(r => r.dayOfWeek === dow).forEach(r => {
      items.push({ id: r.id + '_' + day.toISOString(), start: r.startTime, end: r.endTime, reason: 'Lịch cố định', type: 'RULE', date: day })
    })
  })

  exceptions.forEach(e => {
    const matchDay = weekDays.find(d =>
      d.getDate() === e.date.getUTCDate() &&
      d.getMonth() === e.date.getUTCMonth() &&
      d.getFullYear() === e.date.getUTCFullYear()
    )
    if (!matchDay) return
    items.push({ id: e.id, start: e.startTime, end: e.endTime, reason: e.reason, type: e.type as 'BLOCK' | 'ADD', date: matchDay })
  })

  const gridUser: GridUser = {
    id: user.id,
    name: user.nickname || user.username || 'Tôi',
    items
  }

  return (
    <div className="flex-1 space-y-4 p-6 pt-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Lịch làm việc của tôi</h2>
        <p className="text-sm text-muted-foreground mt-1">Kéo rê để báo cáo thời gian bận của bạn trong tuần</p>
      </div>

      <div className="bg-card w-full rounded-xl border shadow-sm p-4">
        <OptimisticGrid
          workspaceId={workspaceId}
          date={baseDate}
          users={[gridUser]}
        />
      </div>
    </div>
  )
}
