import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { redirect } from 'next/navigation'
import { OptimisticGrid, GridUser, ScheduleItem } from '@/components/schedule/OptimisticGrid'
import { startOfWeek, endOfWeek, eachDayOfInterval, format } from 'date-fns'

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

  const session = await getSession()
  if (!session) redirect('/login')

  const user = session.user
  if ((user as any).role === 'CLIENT') redirect(`/${workspaceId}/dashboard`)

  // Get the current profile — crucial for data isolation
  const profileId = (user as any).sessionProfileId as string | undefined
  if (!profileId) redirect('/profile')

  const baseDate = query?.date ? new Date(query.date) : new Date()
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 })
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })

  const normalizedDays = weekDays.map(d =>
    new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  )

  // Fetch all staff members of THIS profile (same pattern as admin/users page)
  const staffMembers = await prisma.user.findMany({
    where: {
      OR: [
        { profileId: profileId },
        { profileAccesses: { some: { profileId: profileId } } }
      ],
      role: { not: 'CLIENT' }
    },
    select: { id: true, nickname: true, username: true },
    orderBy: { username: 'asc' }
  })

  const staffIds = staffMembers.map(s => s.id)
  const daysOfWeek = weekDays.map(d => d.getDay())

  // Use workspace-scoped prisma WITH profileId for schedule data
  const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

  const rules = await workspacePrisma.scheduleRule.findMany({
    where: {
      dayOfWeek: { in: daysOfWeek },
      userId: { in: staffIds },
      isActive: true
    }
  })

  const exceptions = await workspacePrisma.scheduleException.findMany({
    where: {
      date: { gte: normalizedDays[0], lte: normalizedDays[6] },
      userId: { in: staffIds }
    }
  })

  // Build GridUser[]
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
          Xem lịch làm việc của từng nhân sự trong team — chỉ xem, không can thiệp
        </p>
      </div>

      {gridUsers.length === 0 ? (
        <div className="flex items-center justify-center h-48 border border-dashed border-border rounded-xl text-muted-foreground text-sm">
          Chưa có nhân sự nào trong profile này.
        </div>
      ) : (
        <div className="bg-card w-full rounded-xl border shadow-sm p-4">
          <OptimisticGrid
            workspaceId={workspaceId}
            profileId={profileId}
            dateStr={format(baseDate, 'yyyy-MM-dd')}
            users={gridUsers}
            readOnly={true}
          />
        </div>
      )}
    </div>
  )
}
