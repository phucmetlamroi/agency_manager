'use client'

/**
 * [Hook Graph — variant readout]
 *
 * The "render queue": every root→leaf path = one video. Hovering a row
 * highlights that exact path on the canvas.
 */

import { useMemo } from 'react'
import type { HookBlock } from '@/lib/velox/hook-graph-types'
import { formatTimecode } from '@/lib/velox/hook-graph-types'
import type { VariantReadout } from '@/lib/velox/hook-graph-paths'
import { tagHex } from './hook-graph-style'

export function HookVariantPanel({
    readout,
    blocks,
    onHoverPath,
}: {
    readout: VariantReadout
    blocks: HookBlock[]
    onHoverPath: (blockIds: string[] | null) => void
}) {
    const byId = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks])

    return (
        <div className="flex h-full flex-col">
            <div className="px-3.5 pt-3.5">
                <div className="flex items-end gap-2">
                    <span className="bg-gradient-to-br from-violet-200 to-violet-400 bg-clip-text text-3xl font-bold leading-none tabular-nums text-transparent">
                        {readout.truncated ? `${readout.count}+` : readout.count}
                    </span>
                    <span className="pb-0.5 text-sm font-medium text-zinc-400">biến thể</span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                    Mỗi đường đi qua sơ đồ là một video phải dựng.
                </p>
            </div>

            <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {readout.count === 0 ? (
                    <div className="mx-1.5 mt-2 rounded-xl border border-dashed border-white/10 px-3 py-5 text-center text-[11.5px] leading-relaxed text-zinc-500">
                        Chưa có biến thể nào.
                        <br />
                        Thêm block rồi nối chúng lại để tạo đường đi.
                    </div>
                ) : (
                    <ul className="space-y-1">
                        {readout.paths.map((p, i) => (
                            <li key={i}>
                                <button
                                    type="button"
                                    onMouseEnter={() => onHoverPath(p.blockIds)}
                                    onMouseLeave={() => onHoverPath(null)}
                                    onFocus={() => onHoverPath(p.blockIds)}
                                    onBlur={() => onHoverPath(null)}
                                    className="group flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors hover:border-violet-400/30 hover:bg-violet-500/10"
                                >
                                    <span className="w-5 shrink-0 text-[10px] font-semibold tabular-nums text-zinc-600 group-hover:text-violet-300">
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-0.5">
                                        {p.blockIds.map((bid, k) => {
                                            const b = byId.get(bid)
                                            return (
                                                <span key={bid} className="inline-flex items-center gap-1">
                                                    {k > 0 && <span className="text-zinc-600">›</span>}
                                                    <span
                                                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                                                        style={{ background: tagHex(b?.tag) }}
                                                    />
                                                    <span className="truncate text-[11px] text-zinc-300">
                                                        {b?.name ?? '—'}
                                                    </span>
                                                </span>
                                            )
                                        })}
                                    </span>
                                    {p.runtimeSec > 0 && (
                                        <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">
                                            {formatTimecode(p.runtimeSec)}
                                        </span>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {readout.truncated && (
                    <p className="px-2 pt-2 text-[10px] text-amber-400/80">
                        Quá nhiều biến thể — chỉ hiển thị {readout.count} đầu tiên.
                    </p>
                )}
            </div>
        </div>
    )
}
