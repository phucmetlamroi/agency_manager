import PageSkeleton from '@/components/ui/PageSkeleton'
import { isMobileDevice } from '@/lib/device'

// [Mobile P4.7 / M11] Skeleton Cài đặt Workspace. Desktop giữ PageSkeleton (BẤT BIẾN —
// HARD INVARIANT #1); mobile nhận khung: title + tab bar (3×h-12) + card field.
export default async function Loading() {
    const isMobile = await isMobileDevice()
    if (!isMobile) return <PageSkeleton />

    return (
        <div className="flex flex-col gap-4">
            {/* title */}
            <div className="portal-skeleton h-7 w-48 rounded-lg" />
            {/* tab bar */}
            <div className="glass-2 flex gap-1 p-1">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="portal-skeleton h-12 flex-1 rounded-lg" />
                ))}
            </div>
            {/* card fields */}
            <div className="glass-1 rounded-xl p-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <div className="portal-skeleton h-3 w-24 rounded" />
                        <div className="portal-skeleton h-12 w-full rounded-xl" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <div className="portal-skeleton h-3 w-16 rounded" />
                        <div className="portal-skeleton h-12 w-full rounded-xl" />
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="portal-skeleton h-12 rounded-lg" />
                    ))}
                </div>
            </div>
        </div>
    )
}
