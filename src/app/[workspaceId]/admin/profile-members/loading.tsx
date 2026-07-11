import PageSkeleton from '@/components/ui/PageSkeleton'
import { isMobileDevice } from '@/lib/device'

// [Mobile P4.2 / M8] Skeleton Thành viên. Desktop giữ PageSkeleton (BẤT BIẾN — HARD INVARIANT #1);
// mobile nhận khung M8: title + search h-12 + card 8 hàng h-14.
export default async function Loading() {
    const isMobile = await isMobileDevice()
    if (!isMobile) return <PageSkeleton />

    return (
        <div className="flex flex-col gap-3">
            {/* title */}
            <div className="portal-skeleton h-7 w-40 rounded-lg" />
            {/* search */}
            <div className="portal-skeleton h-12 w-full rounded-xl" />
            {/* card: 8 hàng h-14 */}
            <div className="glass-1 divide-y divide-white/[0.06] rounded-xl">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex h-14 items-center gap-3 px-3">
                        <div className="portal-skeleton h-10 w-10 shrink-0 rounded-full" />
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <div className="portal-skeleton h-3.5 w-32 rounded" />
                            <div className="portal-skeleton h-3 w-20 rounded" />
                        </div>
                        <div className="portal-skeleton h-6 w-14 shrink-0 rounded-full" />
                        <div className="portal-skeleton h-11 w-11 shrink-0 rounded-full" />
                    </div>
                ))}
            </div>
        </div>
    )
}
