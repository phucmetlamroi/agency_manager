// [Giao diện 2 · Mission Control · M3 Task Drawer] Route for the MC-styled task drawer.
// Loads ONE task via loadTaskDetail (server-sanitized: strips admin-only $ for non-admins,
// fails closed) and renders McTaskDrawer over a static blurred backdrop. Admin-gated like the
// other MC screens. Full editing bridges to the Giao diện 1 drawer.
import { redirect, notFound } from 'next/navigation'
import { verifyProfileAdminAccess } from '@/lib/security'
import { loadTaskDetail } from '@/lib/task-detail-loader'
import { getDisplayName } from '@/lib/display-name'
import McTaskDrawer, { type McTaskDetail } from '@/components/mission-control/McTaskDrawer'

export const dynamic = 'force-dynamic'

const STATUS_HEX: Record<string, string> = {
    'Đang đợi giao': '#A855F7', 'Nhận task': '#3B82F6', 'Đã nhận task': '#3B82F6', 'Đang thực hiện': '#EAB308',
    'Đã nộp video (nội bộ)': '#6366F1', 'Đang sửa feedback (nội bộ)': '#F59E0B', 'Đã sửa feedback (nội bộ)': '#14B8A6', 'Revision': '#EF4444',
    'Đã gửi video (khách)': '#06B6D4', 'Đã nhận feedback (khách)': '#EF4444', 'Đã sửa feedback (khách)': '#8B5CF6',
    'Quá hạn': '#DC2626', 'Hoàn tất': '#10B981', 'Đã hủy': '#52525B',
}
const STATUS_LABEL: Record<string, string> = { Revision: 'Sửa lại' }
const RANK_HEX: Record<string, string> = { S: '#FACC15', A: '#34D399', B: '#60A5FA', C: '#A1A1AA', D: '#F87171' }
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
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const pad = (n: number) => String(n).padStart(2, '0')
function fmtDT(d: any): string | null {
    if (!d) return null
    const t = new Date(d)
    return `${WD[t.getDay()]} ${t.getDate()}/${pad(t.getMonth() + 1)} · ${pad(t.getHours())}:${pad(t.getMinutes())}`
}
function fmtDate(d: any): string {
    if (!d) return '—'
    const t = new Date(d)
    return `${t.getDate()}/${pad(t.getMonth() + 1)}/${t.getFullYear()}`
}
function phaseOf(status: string): number {
    if (['Đang đợi giao', 'Nhận task', 'Đã nhận task'].includes(status)) return 0
    if (status === 'Đang thực hiện') return 1
    if (['Đã nộp video (nội bộ)', 'Đang sửa feedback (nội bộ)', 'Đã sửa feedback (nội bộ)', 'Revision'].includes(status)) return 2
    if (['Đã gửi video (khách)', 'Đã nhận feedback (khách)', 'Đã sửa feedback (khách)'].includes(status)) return 3
    if (status === 'Quá hạn') return 4
    if (status === 'Hoàn tất') return 5
    return -1
}
function extractRaw(resources: any): string | null {
    if (!resources || typeof resources !== 'string') return null
    const m = resources.match(/RAW:\s*([^|]+?)\s*(?:\||$)/)
    const v = m?.[1]?.trim()
    return v && /^https?:\/\//i.test(v) ? v : null
}

export default async function MissionControlTaskDrawerPage({ params }: { params: Promise<{ workspaceId: string; taskId: string }> }) {
    const { workspaceId, taskId } = await params

    // Admin-gate like the other MC screens (MC surfaces wages/KPIs).
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    const res = await loadTaskDetail(workspaceId, taskId)
    if (res.kind === 'redirect') redirect(res.to)
    if (res.kind === 'notFound') notFound()

    const t: any = res.task
    const client = t.client ? (t.client.parent?.name ? `${t.client.parent.name} / ${t.client.name}` : t.client.name) : null
    const assigneeName = t.assignee ? getDisplayName(t.assignee) : null
    const assigneeRank = t.assignee?.monthlyRanks?.[0]?.rank as string | undefined

    const detail: McTaskDetail = {
        id: t.id,
        code: `TASK · ${String(t.id).slice(-6).toUpperCase()}`,
        title: t.title || 'Untitled',
        type: t.type || '—',
        tags: (t.taskTags || []).map((tt: any) => tt.tagCategory?.name).filter(Boolean),
        status: t.status,
        statusHex: STATUS_HEX[t.status] || '#A1A1AA',
        statusLabel: STATUS_LABEL[t.status] || t.status,
        phaseIndex: phaseOf(t.status),
        client,
        assignee: assigneeName
            ? { name: assigneeName, initials: initials(assigneeName), avatar: grad(t.assigneeId || assigneeName), rank: assigneeRank, rankColor: assigneeRank ? (RANK_HEX[assigneeRank] || '#A1A1AA') : undefined }
            : null,
        managerName: t.assignedBy ? getDisplayName(t.assignedBy) : null,
        assignedByName: t.assignedBy ? getDisplayName(t.assignedBy) : null,
        deadline: fmtDT(t.deadline),
        wageVND: Number(t.wageVND ?? t.value ?? 0),
        productLink: t.productLink && String(t.productLink).trim() ? String(t.productLink).trim() : null,
        rawFootageLink: extractRaw(t.resources),
        createdAt: fmtDate(t.createdAt),
        updatedAt: fmtDate(t.updatedAt),
    }

    return <McTaskDrawer detail={detail} workspaceId={workspaceId} fullEditHref={`/${workspaceId}/task/${taskId}`} />
}
