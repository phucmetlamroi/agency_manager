'use server'
// [Giao diện 2 · Mission Control · M3 overlay] Server action behind the board's in-place task
// drawer (owner's 2026-07-14 review [03:52-04:10]: the drawer must FLOAT OVER the real board —
// dimmed behind — instead of navigating to a page that wipes it, and must feel instant).
// Gate mirrors /mc/task/[taskId]/page.tsx exactly: verifyProfileAdminAccess fail-closed, then
// the shared builder (loadTaskDetail sanitizer + vetted getTaskAssets). Returns a plain
// serializable payload; NO extra fields beyond what the route page already exposes.
import { verifyProfileAdminAccess } from '@/lib/security'
import { buildMcTaskDrawerData } from '@/lib/mc-task-drawer-data'
import type { McTaskDetail } from '@/components/mission-control/McTaskDrawer'

export async function loadMcTaskDrawer(
    workspaceId: string,
    taskId: string,
): Promise<{ detail: McTaskDetail } | { error: string }> {
    try {
        await verifyProfileAdminAccess(workspaceId)
    } catch {
        return { error: 'FORBIDDEN' }
    }
    try {
        const res = await buildMcTaskDrawerData(workspaceId, taskId)
        if (res.kind === 'ok') return { detail: res.detail }
        if (res.kind === 'notFound') return { error: 'Không tìm thấy task.' }
        return { error: 'Không tải được chi tiết task.' }
    } catch {
        return { error: 'Không tải được chi tiết task.' }
    }
}
