import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getCurrentUser } from '@/lib/auth-guard'
import { redirect } from 'next/navigation'
import { OptimisticGrid, GridUser, ScheduleItem } from '@/components/schedule/OptimisticGrid'
import { format } from 'date-fns'

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

  // Parse date or use today
  const targetDate = query?.date ? new Date(query.date) : new Date()
  const normalizedDateStr = format(targetDate, 'yyyy-MM-dd')
  const normalizeDate = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()))
  const dayOfWeek = targetDate.getUTCDay()

  const prisma = getWorkspacePrisma(workspaceId)

  // 1. Fetch Rules & Exceptions for this specific date for current user
  const rules = await prisma.scheduleRule.findMany({
    where: { 
      dayOfWeek,
      userId: user.id
    }
  })

  const exceptions = await prisma.scheduleException.findMany({
    where: {
      date: normalizeDate,
      userId: user.id
    }
  })

  // 3. Transform to GridUser format (Only 1 user)
  const items: ScheduleItem[] = []
  
  rules.forEach(r => items.push({ id: r.id, start: r.startTime, end: r.endTime, reason: 'Lịch cố định', type: 'RULE' }))
  exceptions.forEach(e => items.push({ id: e.id, start: e.startTime, end: e.endTime, reason: e.reason, type: e.type as "BLOCK" | "ADD" }))

  const gridUser: GridUser = {
    id: user.id,
    name: user.nickname || user.username || 'Me',
    items
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Lịch làm việc của tôi</h2>
      </div>
      <p className="text-muted-foreground">
        Ngày đang xem: <span className="font-semibold text-foreground">{normalizedDateStr}</span>
      </p>

      <div className="bg-card w-full rounded-lg border shadow-sm p-4 mt-6">
        <p className="mb-4 text-sm text-muted-foreground">Kéo thả trên lưới thời gian bên dưới để báo cáo trạng thái Khả dụng/Bận.</p>
        <OptimisticGrid 
          workspaceId={workspaceId} 
          date={normalizeDate}
          users={[gridUser]}
        />
      </div>
    </div>
  )
}
