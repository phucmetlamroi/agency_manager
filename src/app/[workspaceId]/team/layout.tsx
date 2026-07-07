// [review-fixes P1 / BR-02·BR-03·BR-09·FR-12-route] Route review "Tệp" dời KHỎI /admin.
// Layout NÀY chỉ gate MEMBERSHIP (không phải admin) — editor (role USER) vào được, khớp
// tầng API requireReviewAccess (access.ts đã cho USER pass). CLIENT/LOCKED + người ngoài
// workspace bị đá về dashboard. Chrome (sidebar) do (browser)/layout.tsx cấp; route player
// asset/[assetId] nằm NGOÀI route group (browser) → full-bleed, thoát AdminShell → sửa B9
// (ReviewPlayerShell h-[100dvh] trước đây tràn trong container p-8 + spacer của AdminShell).
import { redirect, notFound } from 'next/navigation'
import { requireReviewAccess, ReviewAccessError } from '@/lib/review/access'

// Khớp regex của admin/layout: cho UUID + legacy slug, chặn path có dấu chấm (PWA scan).
const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

export default async function TeamLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ workspaceId: string }>
}) {
    const { workspaceId } = await params
    if (!WORKSPACE_ID_PATTERN.test(workspaceId)) notFound()

    // Membership-only gate (defense-in-depth — mọi route /api/review/* vẫn tự re-check).
    // USER pass; LOCKED/CLIENT + non-member bị chặn. KHÔNG dùng verifyProfileAdminAccess
    // (đó là lỗi gốc B2/B3/B9: guard admin đá editor về dashboard).
    try {
        await requireReviewAccess({ workspaceId })
    } catch (e) {
        if (e instanceof ReviewAccessError && e.status === 401) redirect('/login')
        redirect(`/${workspaceId}/dashboard`)
    }

    return <>{children}</>
}
