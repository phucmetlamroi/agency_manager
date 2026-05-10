// [Sprint K P2] Loading skeleton for Analytics page (Next.js convention).
// Replaces blank screen during getAnalyticsData() (1000+ staff queries can
// take 3-5s).

export default function AnalyticsLoading() {
    return (
        <div className="h-full flex flex-col p-6 w-full max-w-[1700px] mx-auto space-y-6 animate-pulse">
            <div className="flex items-center justify-between shrink-0">
                <div className="space-y-2">
                    <div className="h-9 w-72 rounded-lg bg-zinc-800/60" />
                    <div className="h-4 w-96 rounded bg-zinc-800/40" />
                </div>
                <div className="h-12 w-48 rounded-2xl bg-zinc-900/80 border border-white/5" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 flex-1 min-h-0">
                {/* Table skeleton */}
                <div className="xl:col-span-3 min-h-[500px] rounded-2xl bg-zinc-900/40 border border-white/5 p-4 space-y-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-zinc-800/60" />
                            <div className="flex-1 h-5 rounded bg-zinc-800/40" />
                            <div className="h-5 w-20 rounded bg-zinc-800/40" />
                            <div className="h-5 w-16 rounded bg-zinc-800/40" />
                        </div>
                    ))}
                </div>

                {/* Presence board skeleton */}
                <div className="xl:col-span-1 h-full min-h-[500px] rounded-2xl bg-zinc-900/40 border border-white/5 p-4 space-y-3">
                    <div className="h-6 w-32 rounded bg-zinc-800/60" />
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-zinc-800/60" />
                            <div className="flex-1 h-4 rounded bg-zinc-800/40" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
