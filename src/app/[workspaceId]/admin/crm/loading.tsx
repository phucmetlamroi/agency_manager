import PageSkeleton from '@/components/ui/PageSkeleton'
import { isMobileDevice } from '@/lib/device'

// [Mobile P4 / M7.4] Skeleton CRM. Desktop giữ PageSkeleton (BẤT BIẾN — HARD INVARIANT #1);
// mobile nhận khung M7: title bar + search + sort + 5 card h-[88px].
export default async function Loading() {
    const isMobile = await isMobileDevice()
    if (!isMobile) return <PageSkeleton />

    return (
        <div className="flex flex-col gap-3">
            {/* title + CTA */}
            <div className="flex items-center justify-between gap-3">
                <div className="portal-skeleton h-7 w-40 rounded-lg" />
                <div className="portal-skeleton h-11 w-28 rounded-lg" />
            </div>
            {/* search */}
            <div className="portal-skeleton h-12 w-full rounded-xl" />
            {/* sort row */}
            <div className="flex gap-2">
                <div className="portal-skeleton h-10 w-40 rounded-lg" />
            </div>
            {/* 5 card */}
            <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="portal-skeleton h-[88px] w-full rounded-xl" />
                ))}
            </div>
        </div>
    )
}
