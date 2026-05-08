'use client'

/**
 * Shimmer skeleton mimicking MobileTaskCard layout.
 * Use during initial fetch / after pull-to-refresh.
 */
export default function MobileTaskCardSkeleton() {
    return (
        <div className="relative bg-zinc-950/60 backdrop-blur-xl rounded-2xl border border-white/8 shadow-xl shadow-black/30 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-zinc-800 animate-pulse" />

            <div className="p-4 pl-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                        <div className="h-3 w-20 rounded bg-zinc-800/80 animate-pulse" />
                        <div className="h-5 w-3/4 rounded bg-zinc-800/80 animate-pulse" />
                    </div>
                    <div className="w-7 h-7 rounded-lg bg-zinc-800/60 animate-pulse" />
                </div>

                <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="h-6 w-24 rounded-full bg-zinc-800/80 animate-pulse" />
                    <div className="h-3 w-20 rounded bg-zinc-800/60 animate-pulse" />
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/5">
                    <div className="h-4 w-24 rounded bg-zinc-800/60 animate-pulse" />
                    <div className="h-7 w-20 rounded-lg bg-zinc-800/80 animate-pulse" />
                </div>
            </div>
        </div>
    )
}
