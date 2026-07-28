'use client'

/**
 * [kiểm toán 2026-07 · S2-3] 404 BÊN TRONG vỏ ứng dụng — giữ nguyên sidebar.
 *
 * Phải là client component vì `not-found.tsx` của Next KHÔNG nhận `params` — không có
 * cách nào lấy workspaceId ở phía máy chủ. Đọc từ đường dẫn là lối duy nhất.
 */
import { usePathname } from 'next/navigation'
import { NotFoundPanel } from './NotFoundPanel'

export function WorkspaceNotFound({ area }: { area: 'admin' | 'dashboard' }) {
    const pathname = usePathname() || ''
    const workspaceId = pathname.split('/').filter(Boolean)[0]
    // Không đọc được workspace (đường dẫn dị dạng) thì lui về trang chủ, đừng dựng ra
    // một link "/undefined/dashboard" chắc chắn hỏng.
    const homeHref = workspaceId ? `/${workspaceId}/${area}` : '/'

    return <NotFoundPanel inShell homeHref={homeHref} homeLabel="Về Tổng quan" />
}
