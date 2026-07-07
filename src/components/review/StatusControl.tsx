'use client'

// [Review module P3.5] Interactive card-status control (FR-D01) — replaces the P2.3
// placeholder StatusChip on the asset card / list row / InfoPanel. The trigger is the
// colored status chip; clicking opens a searchable dropdown of the app's task-status
// list (read dynamically from GET /api/review/statuses — the module NEVER hardcodes its
// own set) plus a "Bỏ trạng thái" (clear) option. Colors come from view-prefs.statusColor
// so the chip matches the app's task tables. The parent owns the write + optimistic
// update via `onPick`; this component owns only the open/search UI state.

import { useEffect, useMemo, useRef, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown, Loader2, Plus, Search, X } from 'lucide-react'
import { statusColor } from '@/lib/review/view-prefs'
import { fetchStatusOptions } from '@/lib/review/team-actions'
import { statusLabel } from '@/lib/display-labels'

interface StatusOption {
    value: string
    label: string
}

// Module-level cache: the status list is app-global config, so fetch it once per session.
let optionsCache: Promise<StatusOption[]> | null = null
function getStatusOptions(): Promise<StatusOption[]> {
    if (!optionsCache) {
        optionsCache = fetchStatusOptions().catch((e) => {
            optionsCache = null // allow a retry on the next open
            throw e
        })
    }
    return optionsCache
}

/** Colored status pill — the read-only presentation shared by the trigger + static chip. */
export function StatusPillView({ status, trailing }: { status: string | null; trailing?: React.ReactNode }) {
    if (!status) return null
    const c = statusColor(status)
    return (
        <span
            className="inline-flex max-w-full items-center gap-1 truncate rounded-full px-1.5 py-0.5 text-[10.5px] font-medium"
            style={{ color: c, background: `${c}1A`, border: `1px solid ${c}44` }}
            title={status}
        >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c }} />
            <span className="truncate">{statusLabel(status)}</span>
            {trailing}
        </span>
    )
}

export function StatusControl({
    status,
    onPick,
    align = 'start',
    disabled = false,
}: {
    status: string | null
    onPick: (statusId: string | null) => void
    align?: 'start' | 'end'
    disabled?: boolean
}) {
    const [open, setOpen] = useState(false)
    const [options, setOptions] = useState<StatusOption[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(false)
    const [query, setQuery] = useState('')
    const searchRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!open || options.length > 0) return
        let alive = true
        setLoading(true)
        setError(false)
        getStatusOptions()
            .then((opts) => alive && setOptions(opts))
            .catch(() => alive && setError(true))
            .finally(() => alive && setLoading(false))
        return () => {
            alive = false
        }
    }, [open, options.length])

    // Reset the query each time it opens; focus the search box.
    useEffect(() => {
        if (open) {
            setQuery('')
            const t = setTimeout(() => searchRef.current?.focus(), 0)
            return () => clearTimeout(t)
        }
    }, [open])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return options
        return options.filter((o) => o.label.toLowerCase().includes(q))
    }, [options, query])

    const pick = (value: string | null) => {
        setOpen(false)
        if (value !== status) onPick(value)
    }

    const stop = (e: React.SyntheticEvent) => e.stopPropagation()

    return (
        <Popover.Root open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={stop}
                    onDoubleClick={stop}
                    className="inline-flex max-w-full items-center gap-1 rounded-full outline-none transition-opacity hover:opacity-90 disabled:opacity-50"
                    title={status ? `Trạng thái: ${status}` : 'Đặt trạng thái'}
                >
                    {status ? (
                        <StatusPillView
                            status={status}
                            trailing={<ChevronDown size={10} className="shrink-0 opacity-70" />}
                        />
                    ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/15 px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-500 hover:border-white/25 hover:text-zinc-300">
                            <Plus size={10} /> Trạng thái
                        </span>
                    )}
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    align={align}
                    sideOffset={6}
                    onClick={stop}
                    onDoubleClick={stop}
                    className="z-50 w-[230px] overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 text-zinc-200 shadow-2xl shadow-black/60 backdrop-blur-xl"
                    style={{ fontFamily: "var(--font-sans), 'Plus Jakarta Sans', sans-serif" }}
                >
                    <div className="flex items-center gap-1.5 border-b border-white/[0.07] px-2.5 py-2">
                        <Search size={13} className="shrink-0 text-zinc-500" />
                        <input
                            ref={searchRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                e.stopPropagation()
                                if (e.key === 'Enter' && filtered.length === 1) pick(filtered[0].value)
                                if (e.key === 'Escape') setOpen(false)
                            }}
                            placeholder="Tìm trạng thái…"
                            className="w-full bg-transparent text-[12.5px] text-zinc-100 placeholder:text-zinc-600 outline-none"
                        />
                    </div>
                    <div className="max-h-[260px] overflow-y-auto p-1">
                        {status && (
                            <button
                                type="button"
                                onClick={() => pick(null)}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-[7px] text-[12.5px] text-zinc-400 outline-none transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
                            >
                                <X size={13} className="shrink-0" />
                                Bỏ trạng thái
                            </button>
                        )}
                        {loading ? (
                            <div className="flex items-center gap-2 px-2.5 py-3 text-[12px] text-zinc-500">
                                <Loader2 size={13} className="animate-spin" /> Đang tải…
                            </div>
                        ) : error ? (
                            <div className="px-2.5 py-3 text-[12px] text-red-300/90">Không tải được danh sách trạng thái.</div>
                        ) : filtered.length === 0 ? (
                            <div className="px-2.5 py-3 text-[12px] text-zinc-500">Không có trạng thái khớp.</div>
                        ) : (
                            filtered.map((o) => {
                                const c = statusColor(o.value)
                                const active = o.value === status
                                return (
                                    <button
                                        key={o.value}
                                        type="button"
                                        onClick={() => pick(o.value)}
                                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-[7px] text-[12.5px] outline-none transition-colors ${
                                            active ? 'bg-white/[0.06] text-white' : 'text-zinc-200 hover:bg-violet-500/15 hover:text-white'
                                        }`}
                                    >
                                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />
                                        <span className="flex-1 truncate text-left">{o.label}</span>
                                        {active && <Check size={13} className="shrink-0 text-violet-300" />}
                                    </button>
                                )
                            })
                        )}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}
