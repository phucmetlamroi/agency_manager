'use client'

// [Giải trí · E1] Khung kho phim — GIAO DIỆN NGƯỜI XEM.
// Phase E4 thay ruột bằng khu nổi bật + lưới poster + "Xem tiếp"; phase này chỉ
// dựng khung + thanh tab để luồng mã truy cập chạy được đầu-cuối.

import type { EntCodeRole } from '@prisma/client'
import EntTabBar from './EntTabBar'

export default function EntLibrary({ role }: { role: EntCodeRole }) {
    return (
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
            <EntTabBar role={role} />
            <div className="mt-16 text-center">
                <p className="text-zinc-400">Kho phim đang trống.</p>
                {role === 'ENT_ADMIN' && (
                    <p className="mt-2 text-sm text-zinc-600">Sang tab “Up phim” để thêm video.</p>
                )}
            </div>
        </div>
    )
}
