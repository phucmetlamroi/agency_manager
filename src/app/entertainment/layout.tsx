// [Giải trí] Vỏ ngoài kho phim. Nằm NGOÀI /[workspaceId] vì kho không thuộc tổ
// chức nào — cùng lý do /billing-ops và /account/trash nằm ngoài.
//
// Lớp gác thứ nhất (đăng nhập) ở đây; lớp thứ hai (mã truy cập) ở từng trang,
// vì hai lớp dẫn đi hai nơi khác nhau: chưa đăng nhập → /login, chưa có mã →
// màn nhập mã. Middleware KHÔNG phủ đường dẫn này (PROTECTED_SEG chỉ bắt
// /{ws}/admin|dashboard|team|mc) nên mọi trang và mọi route API tự gác.

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export const metadata = {
    title: 'Giải trí',
    // noindex: kho riêng, không có lý do gì để lên máy tìm kiếm.
    robots: { index: false, follow: false },
}

export default async function EntertainmentLayout({ children }: { children: React.ReactNode }) {
    const session = await getSession()
    if (!session?.user?.id) redirect('/login')

    return <div className="min-h-dvh bg-zinc-950 text-zinc-100">{children}</div>
}
