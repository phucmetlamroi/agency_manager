'use client'

/**
 * [Hook Graph — block inspector]
 *
 * Compact property editor for the selected block, focused on script-support
 * fields (per the demo feedback): Name, colour tag, Link, Duration (min+sec),
 * Note, Status (Nháp / Cần review / Đã duyệt), and an OPTIONAL Timecode trim.
 */

import { useState } from 'react'
import type { HookBlock, HookBlockStatus } from '@/lib/velox/hook-graph-types'
import { formatTimecode } from '@/lib/velox/hook-graph-types'
import { STATUS_META, TAG_PALETTE, rgba, tagHex } from './hook-graph-style'

const fieldCls =
    'w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[12px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-400/60'
const labelCls = 'mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500'

/** The three statuses the user asked for (others stay in the type for back-compat). */
const STATUS3: HookBlockStatus[] = ['DRAFT', 'REVIEW', 'APPROVED']

export function HookInspector({
    block,
    onChange,
    onClose,
    onEditStart,
}: {
    block: HookBlock
    onChange: (patch: Partial<HookBlock>) => void
    onClose: () => void
    onEditStart?: () => void
}) {
    const [showTc, setShowTc] = useState(!!block.timecode)

    const totalSec = block.durationSec ?? 0
    const durMin = totalSec ? Math.floor(totalSec / 60) : 0
    const durSec = totalSec ? totalSec % 60 : 0
    const setDuration = (min: number, sec: number) => {
        const t = Math.max(0, min) * 60 + Math.max(0, sec)
        onChange({ durationSec: t > 0 ? t : undefined })
    }

    const tc = block.timecode
    const setTc = (patch: Partial<NonNullable<HookBlock['timecode']>>) => {
        const next = {
            inSec: tc?.inSec ?? 0,
            outSec: tc?.outSec ?? 0,
            fileUrl: tc?.fileUrl,
            fileName: tc?.fileName,
            ...patch,
        }
        const empty = !next.fileUrl?.trim() && !next.inSec && !next.outSec && !next.fileName?.trim()
        onChange({ timecode: empty ? undefined : next })
    }

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 px-3.5 pb-2 pt-3.5">
                <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: tagHex(block.tag), boxShadow: `0 0 8px ${rgba(tagHex(block.tag), 0.7)}` }}
                />
                <span className="flex-1 truncate text-[12px] font-semibold text-zinc-200">Thuộc tính block</span>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                >
                    ✕
                </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-3.5 pb-4">
                {/* name */}
                <div>
                    <label className={labelCls}>Tên block</label>
                    <input
                        className={fieldCls}
                        value={block.name}
                        placeholder="vd: Hook 1"
                        onFocus={() => onEditStart?.()}
                        onChange={(e) => onChange({ name: e.target.value })}
                    />
                </div>

                {/* tag */}
                <div>
                    <label className={labelCls}>Nhãn dán màu</label>
                    <div className="flex flex-wrap gap-1.5">
                        {TAG_PALETTE.map((t) => {
                            const active = block.tag === t.key
                            return (
                                <button
                                    key={t.key}
                                    type="button"
                                    title={t.label}
                                    onClick={() => {
                                        onEditStart?.()
                                        onChange({ tag: active ? undefined : t.key })
                                    }}
                                    className="h-6 rounded-md border px-1.5 text-[10px] font-medium transition-transform hover:scale-105"
                                    style={{
                                        color: active ? '#0b0a12' : t.hex,
                                        background: active ? t.hex : rgba(t.hex, 0.14),
                                        borderColor: active ? t.hex : rgba(t.hex, 0.35),
                                    }}
                                >
                                    {t.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* link */}
                <div>
                    <label className={labelCls}>Đường link</label>
                    <input
                        className={fieldCls}
                        value={block.url ?? ''}
                        placeholder="https://… (link video)"
                        onFocus={() => onEditStart?.()}
                        onChange={(e) => onChange({ url: e.target.value || undefined })}
                    />
                </div>

                {/* duration: minutes + seconds */}
                <div>
                    <label className={labelCls}>Thời lượng</label>
                    <div className="flex items-center gap-2">
                        <div className="flex flex-1 items-center gap-1.5">
                            <input
                                type="number"
                                min={0}
                                className={fieldCls}
                                value={durMin || ''}
                                placeholder="0"
                                onFocus={() => onEditStart?.()}
                                onChange={(e) => setDuration(Number(e.target.value) || 0, durSec)}
                            />
                            <span className="shrink-0 text-[11px] text-zinc-500">phút</span>
                        </div>
                        <div className="flex flex-1 items-center gap-1.5">
                            <input
                                type="number"
                                min={0}
                                max={59}
                                className={fieldCls}
                                value={durSec || ''}
                                placeholder="0"
                                onFocus={() => onEditStart?.()}
                                onChange={(e) => setDuration(durMin, Number(e.target.value) || 0)}
                            />
                            <span className="shrink-0 text-[11px] text-zinc-500">giây</span>
                        </div>
                    </div>
                </div>

                {/* note */}
                <div>
                    <label className={labelCls}>Ghi chú</label>
                    <textarea
                        rows={3}
                        className={`${fieldCls} resize-none`}
                        value={block.note ?? ''}
                        placeholder="Ghi chú cho editor…"
                        onFocus={() => onEditStart?.()}
                        onChange={(e) => onChange({ note: e.target.value || undefined })}
                    />
                </div>

                {/* status — 3 options */}
                <div>
                    <label className={labelCls}>Trạng thái</label>
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            onClick={() => {
                                onEditStart?.()
                                onChange({ status: undefined })
                            }}
                            className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                                !block.status
                                    ? 'border-white/20 bg-white/10 text-zinc-200'
                                    : 'border-white/10 text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            Không
                        </button>
                        {STATUS3.map((s) => {
                            const meta = STATUS_META[s]
                            const active = block.status === s
                            return (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => {
                                        onEditStart?.()
                                        onChange({ status: s })
                                    }}
                                    className="rounded-md border px-2 py-0.5 text-[10px] font-medium transition-transform hover:scale-105"
                                    style={{
                                        color: active ? '#0b0a12' : meta.hex,
                                        background: active ? meta.hex : rgba(meta.hex, 0.14),
                                        borderColor: active ? meta.hex : rgba(meta.hex, 0.35),
                                    }}
                                >
                                    {meta.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* timecode — optional, collapsed by default */}
                <div className="rounded-lg border border-white/8 bg-white/[0.02] p-2">
                    <button
                        type="button"
                        onClick={() => setShowTc((v) => !v)}
                        className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
                    >
                        <span>Timecode {tc ? `· ${formatTimecode(tc.inSec)}–${formatTimecode(tc.outSec)}` : '(tuỳ chọn)'}</span>
                        <span>{showTc ? '▾' : '▸'}</span>
                    </button>
                    {showTc && (
                        <div className="mt-2 space-y-2">
                            <input
                                className={fieldCls}
                                value={tc?.fileUrl ?? ''}
                                placeholder="Link file master (tuỳ chọn)"
                                onFocus={() => onEditStart?.()}
                                onChange={(e) => setTc({ fileUrl: e.target.value })}
                            />
                            <div className="flex items-center gap-2">
                                <div className="flex-1">
                                    <span className="mb-0.5 block text-[9px] uppercase tracking-wide text-zinc-600">
                                        In (giây) · {formatTimecode(tc?.inSec ?? 0)}
                                    </span>
                                    <input
                                        type="number"
                                        min={0}
                                        className={fieldCls}
                                        value={tc?.inSec || ''}
                                        onFocus={() => onEditStart?.()}
                                        onChange={(e) => setTc({ inSec: Math.max(0, Number(e.target.value) || 0) })}
                                    />
                                </div>
                                <div className="flex-1">
                                    <span className="mb-0.5 block text-[9px] uppercase tracking-wide text-zinc-600">
                                        Out (giây) · {formatTimecode(tc?.outSec ?? 0)}
                                    </span>
                                    <input
                                        type="number"
                                        min={0}
                                        className={fieldCls}
                                        value={tc?.outSec || ''}
                                        onFocus={() => onEditStart?.()}
                                        onChange={(e) => setTc({ outSec: Math.max(0, Number(e.target.value) || 0) })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
