// [Giao diện 2 · Mission Control · M6 Lịch] Lịch 2 chế độ (admin-gated).
// Nhân sự (rảnh/bận): reuse getAdminAvailabilityWeek READ-ONLY (đếm ca rảnh/ngày) — sửa lịch bắc cầu GĐ1.
// Deadline: data-wired từ Task (assignee + deadline + status), week + month client-side.
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import { resolveActiveProfileId, getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getAdminAvailabilityWeek } from '@/actions/availability-actions'
import { getDisplayName } from '@/lib/display-name'
import McCalendarBoard, { type McCalData, type McCalTask, type McCalStaff } from '@/components/mission-control/McCalendarBoard'

export const dynamic = 'force-dynamic'

const STATUS_HEX: Record<string, string> = {
    'Đang đợi giao': '#A855F7', 'Nhận task': '#3B82F6', 'Đã nhận task': '#3B82F6', 'Đang thực hiện': '#EAB308',
    'Đã nộp video (nội bộ)': '#6366F1', 'Đang sửa feedback (nội bộ)': '#F59E0B', 'Đã sửa feedback (nội bộ)': '#14B8A6', 'Revision': '#EF4444',
    'Đã gửi video (khách)': '#06B6D4', 'Đã nhận feedback (khách)': '#EF4444', 'Đã sửa feedback (khách)': '#8B5CF6',
    'Quá hạn': '#DC2626', 'Hoàn tất': '#10B981', 'Đã hủy': '#52525B',
}
const STATUS_LABEL: Record<string, string> = { Revision: 'Sửa lại' }
const GRADIENTS = [
    'linear-gradient(135deg,#6366F1,#8B5CF6)', 'linear-gradient(135deg,#10B981,#06B6D4)', 'linear-gradient(135deg,#EC4899,#F43F5E)',
    'linear-gradient(135deg,#A855F7,#EC4899)', 'linear-gradient(135deg,#F59E0B,#EAB308)', 'linear-gradient(135deg,#06B6D4,#3B82F6)',
]
function grad(seed: string): string { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return GRADIENTS[h % GRADIENTS.length] }
function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return (name.trim().slice(0, 2) || '?').toUpperCase()
}
// Fallback current week keys (Mon→Sun) in VN time if the availability read errors.
function vnWeekKeys(): string[] {
    const nowVn = new Date(Date.now() + 7 * 3600 * 1000)
    const day = nowVn.getUTCDay() // 0..6 (Sun..Sat)
    const monOff = (day + 6) % 7
    const mon = new Date(nowVn); mon.setUTCDate(nowVn.getUTCDate() - monOff)
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setUTCDate(mon.getUTCDate() + i); return d.toISOString().slice(0, 10) })
}

export default async function MissionControlCalendarPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    const profileId = await resolveActiveProfileId(session.user.id, workspaceId, (session.user as any).sessionProfileId)
    if (!profileId) redirect('/login')
    const wp = getWorkspacePrisma(workspaceId, profileId)

    const todayKey = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)

    const [taskRows, avail] = await Promise.all([
        wp.task.findMany({
            where: { isArchived: false, deadline: { not: null } },
            include: {
                assignee: { select: { id: true, username: true, displayName: true, nickname: true } },
                client: { include: { parent: true } },
            },
            orderBy: { deadline: 'asc' },
        }),
        getAdminAvailabilityWeek(todayKey, workspaceId).catch(() => null),
    ])

    const tasks: McCalTask[] = (taskRows as any[]).map((t) => {
        const dl = new Date(t.deadline)
        const vn = new Date(dl.getTime() + 7 * 3600 * 1000)
        const name = t.assignee ? getDisplayName(t.assignee) : 'Chưa giao'
        const client = t.client ? (t.client.parent?.name ? `${t.client.parent.name} / ${t.client.name}` : t.client.name) : null
        return {
            id: t.id, title: t.title || 'Untitled', client,
            assignee: name, initials: initials(name), avatar: grad(t.assigneeId || name),
            statusHex: STATUS_HEX[t.status] || '#A1A1AA', statusLabel: STATUS_LABEL[t.status] || t.status,
            deadlineKey: vn.toISOString().slice(0, 10), deadlineTime: vn.toISOString().slice(11, 16),
        }
    })

    const availOk = avail && !(avail as any).error
    const weekDays: string[] = availOk ? (avail as any).days : vnWeekKeys()
    const staff: McCalStaff[] = availOk
        ? ((avail as any).users as any[]).map((u) => {
            const perDay: Record<string, number> = {}
            let mx = 0
            for (const k of weekDays) { const n = Array.isArray(u.schedules?.[k]) ? u.schedules[k].length : 0; perDay[k] = n; if (n > mx) mx = n }
            const name = getDisplayName(u)
            return { id: u.id, name, initials: initials(name), avatar: grad(u.id), perDay, maxSlots: mx }
        })
        : []

    const data: McCalData = {
        workspaceId,
        backHref: `/${workspaceId}/admin`,
        weekDays,
        tasks,
        staff,
        scheduleHref: `/${workspaceId}/dashboard`,
    }

    return <McCalendarBoard data={data} />
}
