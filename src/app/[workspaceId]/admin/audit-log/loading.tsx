import PageSkeleton from '@/components/ui/PageSkeleton'
import { isMobileDevice } from '@/lib/device'

// [Mobile P4.3 / M9] Skeleton Nhật ký hoạt động. Desktop giữ PageSkeleton (BẤT BIẾN —
// HARD INVARIANT #1); mobile nhận khung M9: header + 2 nhóm ngày × (header + 3 dòng h-16).
export default async function Loading() {
    if (!(await isMobileDevice())) return <PageSkeleton />

    return (
        <div className="flex animate-pulse flex-col gap-4" aria-hidden="true">
            {/* header: title + nút Lọc */}
            <div className="flex items-center justify-between gap-3">
                <div className="portal-skeleton h-7 w-44 rounded-lg" />
                <div className="portal-skeleton h-11 w-20 rounded-xl" />
            </div>

            {/* 2 nhóm ngày × (day header + 3 dòng) */}
            {Array.from({ length: 2 }).map((_, gi) => (
                <div key={gi} className="flex flex-col gap-1.5">
                    <div className="portal-skeleton h-4 w-20 rounded" />
                    <div className="glass-1 flex flex-col gap-px rounded-xl">
                        {Array.from({ length: 3 }).map((_, ri) => (
                            <div key={ri} className="portal-skeleton h-16 w-full rounded-xl" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}
