// [Mobile P1 §8.3 / FR-H1.1] Khung skeleton dùng chung cho loading.tsx của các route
// chính — hiện <100ms khi chuyển tab (streaming Suspense), tránh màn trắng. Chỉ CSS
// (animate-pulse), không hook → dùng được cả server. Trung tính cho mọi trang (title
// + hàng card + list rows).
export default function PageSkeleton() {
    return (
        <div className="flex animate-pulse flex-col gap-4" aria-hidden="true">
            <div className="h-8 w-48 rounded-lg bg-white/[0.06]" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-28 rounded-2xl bg-white/[0.04]" />
                ))}
            </div>
            <div className="flex flex-col gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-14 rounded-xl bg-white/[0.03]" />
                ))}
            </div>
        </div>
    )
}
