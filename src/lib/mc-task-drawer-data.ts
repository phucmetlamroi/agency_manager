// [Giao diện 2 · Mission Control · M3] Shared builder for the MC task-drawer payload.
// Used by BOTH the route page (/mc/task/[taskId], deep-link) and the overlay server action
// (board click → drawer floats over the REAL board). Callers MUST admin-gate
// (verifyProfileAdminAccess) BEFORE calling — this builder only shapes data.
//
// Review block (owner's 2026-07-14 review [04:10-04:18] + [07:29-07:48]): the drawer's player
// area was a STATIC mock (fake Play button, "sắp có (M11)") — no video showed a player, and a
// real video wouldn't play. Now we load the task's actual deliverables via the vetted
// getTaskAssets (re-checks review access + folder scope internally, zero money fields) and the
// drawer renders real states: ready → poster + play → /mc/asset/[id]; processing → notice;
// none → upload CTA.
import { loadTaskDetail } from '@/lib/task-detail-loader'
import { getTaskAssets } from '@/lib/review/task-assets'
import { getDisplayName } from '@/lib/display-name'
import type { McTaskDetail, McReviewAsset } from '@/components/mission-control/McTaskDrawer'

import { sanitizeExternalUrl } from '@/lib/safe-url'

// [AUDIT HT-031 fix] Trả null (không phải '#') vì McTaskDrawer gác bằng `detail.productLink &&`
// — null làm nút biến mất hẳn, tốt hơn một nút trông bấm được nhưng không đi đâu.
function safeExternal(raw: unknown): string | null {
    const cleaned = sanitizeExternalUrl(typeof raw === 'string' ? raw : undefined)
    return cleaned ? cleaned : null
}

const STATUS_HEX: Record<string, string> = {
    'Đang đợi giao': '#A855F7', 'Nhận task': '#3B82F6', 'Đã nhận task': '#3B82F6', 'Đang thực hiện': '#EAB308',
    'Đã nộp video (nội bộ)': '#6366F1', 'Đang sửa feedback (nội bộ)': '#F59E0B', 'Đã sửa feedback (nội bộ)': '#14B8A6', 'Revision': '#EF4444',
    'Đã gửi video (khách)': '#06B6D4', 'Đã nhận feedback (khách)': '#EF4444', 'Đã sửa feedback (khách)': '#8B5CF6',
    'Quá hạn': '#DC2626', 'Hoàn tất': '#10B981', 'Đã hủy': '#52525B',
}
const STATUS_LABEL: Record<string, string> = { Revision: 'Sửa lại' }
// [BO HANG S/A/B/C/D 2026-07-31] Bo bang mau hang RANK_HEX.
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

export type McTaskDrawerResult =
    | { kind: 'ok'; detail: McTaskDetail }
    | { kind: 'redirect'; to: string }
    | { kind: 'notFound' }

export async function buildMcTaskDrawerData(workspaceId: string, taskId: string): Promise<McTaskDrawerResult> {
    const res = await loadTaskDetail(workspaceId, taskId)
    if (res.kind === 'redirect') return { kind: 'redirect', to: res.to }
    if (res.kind === 'notFound') return { kind: 'notFound' }

    const t: any = res.task
    const client = t.client ? (t.client.parent?.name ? `${t.client.parent.name} / ${t.client.name}` : t.client.name) : null
    const assigneeName = t.assignee ? getDisplayName(t.assignee) : null

    // Review deliverables — best-effort: a review-module hiccup must not sink the whole drawer.
    let review: McReviewAsset[] = []
    try {
        const ta = await getTaskAssets(taskId)
        review = ta.assets.map((a) => {
            const v = a.currentVersion
            return {
                assetId: a.assetId,
                name: a.name,
                versionNumber: v?.versionNumber ?? null,
                ready: v?.uploadStatus === 'ready',
                processing: v?.uploadStatus === 'processing' || v?.uploadStatus === 'uploaded' || v?.uploadStatus === 'uploading',
                posterUrl: v?.media?.posterUrl ?? null,
                unresolved: a.unresolvedCommentCount,
            }
        })
    } catch {
        review = []
    }

    const detail: McTaskDetail = {
        id: t.id,
        code: `TASK #${String(t.id).slice(-6).toUpperCase()}`,
        title: t.title || 'Untitled',
        type: t.type || '—',
        tags: (t.taskTags || []).map((tt: any) => tt.tagCategory?.name).filter(Boolean),
        status: t.status,
        statusHex: STATUS_HEX[t.status] || '#A1A1AA',
        statusLabel: STATUS_LABEL[t.status] || t.status,
        phaseIndex: phaseOf(t.status),
        client,
        assignee: assigneeName
            ? { name: assigneeName, initials: initials(assigneeName), avatar: grad(t.assigneeId || assigneeName) }
            : null,
        managerName: t.assignedBy ? getDisplayName(t.assignedBy) : null,
        assignedByName: t.assignedBy ? getDisplayName(t.assignedBy) : null,
        deadline: fmtDT(t.deadline),
        wageVND: Number(t.wageVND ?? t.value ?? 0),
        // [AUDIT HT-031 fix] McTaskDrawer render giá trị này thẳng vào `href` mà không lọc, và
        // file component đó thuộc vùng Mission Control phải giữ nguyên byte. Lọc ở ĐÂY — tầng
        // dữ liệu, ngoài vùng đóng băng — nên lỗ đóng được mà không chạm vào component. Nạn nhân
        // ở màn này là admin, nên nó nặng hơn kịch bản khách trong finding gốc.
        productLink: safeExternal(t.productLink),
        rawFootageLink: extractRaw(t.resources),
        createdAt: fmtDate(t.createdAt),
        updatedAt: fmtDate(t.updatedAt),
        review,
    }
    return { kind: 'ok', detail }
}
