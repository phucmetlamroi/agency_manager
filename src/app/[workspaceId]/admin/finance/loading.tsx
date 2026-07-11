import { isMobileDevice } from '@/lib/device'

// [Mobile P4.5 / M12 Finance] Skeleton Tài chính. Desktop TRƯỚC ĐÂY không có loading.tsx
// → giữ nguyên hành vi (không skeleton) bằng cách trả null cho desktop (HARD INVARIANT #1).
// Mobile: khung KPI (1 full-width + 2 nửa) + chart h-56 + khối bảng giao dịch.
export default async function Loading() {
    const isMobile = await isMobileDevice()
    if (!isMobile) return null

    return (
        <div className="flex flex-col gap-4">
            {/* header */}
            <div className="flex items-center gap-2.5">
                <div className="portal-skeleton h-9 w-9 rounded-xl" />
                <div className="portal-skeleton h-7 w-32 rounded-lg" />
            </div>

            {/* KPI: 1 full-width + 2 nửa */}
            <div className="flex flex-col gap-3">
                <div className="portal-skeleton h-24 w-full rounded-xl" />
                <div className="grid grid-cols-2 gap-3">
                    <div className="portal-skeleton h-24 w-full rounded-xl" />
                    <div className="portal-skeleton h-24 w-full rounded-xl" />
                </div>
            </div>

            {/* chart */}
            <div className="flex flex-col gap-2">
                <div className="portal-skeleton h-6 w-48 rounded-lg" />
                <div className="portal-skeleton h-56 w-full rounded-xl" />
            </div>

            {/* bảng giao dịch */}
            <div className="flex flex-col gap-2">
                <div className="portal-skeleton h-6 w-28 rounded-lg" />
                <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="portal-skeleton h-11 w-full rounded-lg" />
                    ))}
                </div>
            </div>
        </div>
    )
}
