// [Giao diện 2 · Mission Control · M21 Link chia sẻ] MC entry to the review share-management surface.
// Reuses the ENTIRE SharesTable (danh sách + lọc trạng thái · ⋯ menu Sao chép URL / Chỉnh sửa / Tắt–Bật /
// Xóa · ShareLinkModal: toggle bình luận/tải/tải-khi-đã-duyệt/hiện-mọi-version + mật khẩu + hạn +
// create-then-copy + rowVersion chống ghi đè) — cùng logic GĐ1 /team/shares, chỉ đổi đích nút ← sang MC.
// SharesTable tự fetch /api/review/shares (server: ADMIN thấy HẾT · USER chỉ link của mình + task được
// giao; Xóa cổng ADMIN). Module review KHÔNG có field tiền → 0 rủi ro rò rỉ. Admin-gated fail-closed.
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import { SharesTable } from '@/components/review/SharesTable'

export const dynamic = 'force-dynamic'

export default async function MissionControlSharesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    return <SharesTable workspaceId={workspaceId} backHref={`/${workspaceId}/mc/tep`} />
}
