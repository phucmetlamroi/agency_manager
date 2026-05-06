import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { OptimisticGrid, GridUser, ScheduleItem } from '@/components/schedule/OptimisticGrid'
import { startOfWeek, endOfWeek, eachDayOfInterval, format } from 'date-fns'
import { CalendarDays, Info } from 'lucide-react'

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

  const session = await getSession()
  if (!session) redirect('/login')

  const user = session.user
  if ((user as any).role === 'CLIENT') redirect(`/${workspaceId}/dashboard`)

  const profileId = (user as any).sessionProfileId as string | undefined
  if (!profileId) redirect('/login')

  // ── Date logic (unchanged) ────────────────────────────────
  const baseDate = query?.date ? new Date(query.date) : new Date()
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 })
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })

  const normalizedDays = weekDays.map(d =>
    new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  )

  const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
  const daysOfWeek = weekDays.map(d => d.getDay())

  const rules = await workspacePrisma.scheduleRule.findMany({
    where: { dayOfWeek: { in: daysOfWeek }, userId: user.id, isActive: true }
  })

  const exceptions = await workspacePrisma.scheduleException.findMany({
    where: {
      date: { gte: normalizedDays[0], lte: normalizedDays[6] },
      userId: user.id
    }
  })

  // ── Build schedule items (logic unchanged) ────────────────
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
    name: (user as any).nickname || user.name || user.email || 'Tôi',
    items
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* ── Page Header ──────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-zinc-100 flex items-center gap-3">
            <CalendarDays className="w-6 h-6 text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
            Lịch làm việc của tôi
          </h1>
          <p className="text-zinc-600 text-sm mt-1">Kéo rê để đánh dấu thời gian bận của bạn trong tuần</p>
        </div>
        {/* Hint chip */}
        <div className="hidden md:flex items-center gap-2 text-xs text-zinc-600 bg-zinc-900/60 border border-white/5 px-3 py-2 rounded-xl">
          <Info className="w-3.5 h-3.5 text-indigo-400" />
          Nhấn giữ &amp; kéo để đặt lịch
        </div>
      </div>

      {/* ── Schedule Grid Card ───────────────────────────── */}
      <div className="relative rounded-2xl border border-purple-500/15 bg-zinc-950/70 backdrop-blur-md shadow-xl shadow-black/40 overflow-hidden">
        {/* Ambient top glow */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-96 h-40 bg-purple-500/6 blur-3xl rounded-full pointer-events-none" />
        <div className="relative z-10 p-4">
          <OptimisticGrid
            workspaceId={workspaceId}
            profileId={profileId}
            dateStr={format(baseDate, 'yyyy-MM-dd')}
            users={[gridUser]}
          />
        </div>
      </div>
    </div>
  )
}
