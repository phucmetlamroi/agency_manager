// [Giao diện 2 · Mission Control · M22 Thùng rác Tệp] MC entry to the review trash surface.
// Reuses the ENTIRE TeamTrash (danh sách xóa 30 ngày · khôi phục theo lô · Xóa vĩnh viễn = ADMIN
// (ConfirmModal "không hoàn tác") · badge "Còn N ngày" · "gốc đã mất — không khôi phục" · cap 200/lần) —
// cùng logic GĐ1 /team/trash, chỉ đổi đích nút ← sang MC. TeamTrash tự fetch /api/review/trash +
// /trash/restore + /trash/purge (mỗi cái re-verify membership; purge re-verify workspace ADMIN).
// Quản lý phiên bản (ManageVersionsModal: append-only stack, click row → player ?v=, Tách/Xóa version)
// sống trong TeamBrowser/player → đã reachable ở /mc/tep + /mc/asset (M8/M11).
// Module review KHÔNG có field tiền. Admin-gated fail-closed; back → /mc/tep.
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import { TeamTrash } from '@/components/review/TeamTrash'

export const dynamic = 'force-dynamic'

export default async function MissionControlTrashPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')
    // MC namespace = admin cockpit → gate fail-closed; admin ⇒ "Xóa vĩnh viễn" available.
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    return <TeamTrash workspaceId={workspaceId} isAdmin backHref={`/${workspaceId}/mc/tep`} />
}
