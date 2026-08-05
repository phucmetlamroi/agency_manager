// [Giải trí] Trang kho phim — GIAO DIỆN NGƯỜI XEM.
//
// Chưa có mã hợp lệ ⇒ màn nhập mã. Có mã ⇒ kho phim. Người cầm mã ENT_ADMIN
// thấy thêm thanh tab để nhảy sang trang up phim; người xem không thấy gì cả.

import { cookies } from 'next/headers'
import { resolveEntSession } from '@/lib/ent/auth'
import EntCodeGate from '@/components/ent/EntCodeGate'
import EntLibrary from '@/components/ent/EntLibrary'

export const dynamic = 'force-dynamic'

export default async function EntertainmentPage() {
    const session = await resolveEntSession(await cookies())
    if (!session) return <EntCodeGate />

    return <EntLibrary role={session.role} />
}
