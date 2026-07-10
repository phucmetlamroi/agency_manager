'use client'

/**
 * [Hook Graph — custom React Flow node]
 *
 * A frosted-glass "studio" card: tag-coloured left rail, inline-editable name,
 * a source chip (link / timecode / empty dropzone), duration + status, and
 * hover actions. Two ports (target left, source right) for wiring the DAG.
 */

import { memo, useEffect, useRef, useState } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import {
    blockOpenUrl,
    blockSourceLabel,
    type HookBlockStatus,
    type HookTimecode,
} from '@/lib/velox/hook-graph-types'
import { STATUS_META, rgba, tagHex, tagLabel } from './hook-graph-style'

export type HookNodeData = {
    name: string
    url?: string
    timecode?: HookTimecode
    tag?: string
    status?: HookBlockStatus
    note?: string
    durationSec?: number
    assigneeId?: string | null
    thumbnailUrl?: string
    // injected by the editor (kept out of the persisted graph)
    readOnly?: boolean
    dim?: boolean
    highlight?: boolean
    onRename?: (id: string, name: string) => void
    onEdit?: (id: string) => void
    onDelete?: (id: string) => void
    onOpen?: (id: string) => void
} & Record<string, unknown>

export type HookNode = Node<HookNodeData, 'hookBlock'>

function Icon({ d, size = 13 }: { d: string; size?: number }) {
    return (
        <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d={d} />
        </svg>
    )
}

const I = {
    link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
    clock: 'M12 7v5l3 2 M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
    plus: 'M12 5v14 M5 12h14',
    pencil: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
    trash: 'M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
    open: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14 21 3',
}

function HookBlockNodeInner({ id, data, selected }: NodeProps<HookNode>) {
    const accent = tagHex(data.tag)
    const tLabel = tagLabel(data.tag)
    const status = data.status ? STATUS_META[data.status] : null
    const readOnly = !!data.readOnly

    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(data.name)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (editing) {
            setDraft(data.name)
            requestAnimationFrame(() => inputRef.current?.select())
        }
    }, [editing, data.name])

    const commit = () => {
        const next = draft.trim() || 'Block'
        if (next !== data.name) data.onRename?.(id, next)
        setEditing(false)
    }

    const blockLike = { id, name: data.name, position: { x: 0, y: 0 }, url: data.url, timecode: data.timecode }
    const openUrl = blockOpenUrl(blockLike)
    const hasSource = !!openUrl

    return (
        <div
            className="group relative w-52 select-none rounded-2xl border text-left transition-[box-shadow,transform,opacity] duration-150"
            style={{
                opacity: data.dim ? 0.32 : 1,
                background: 'linear-gradient(180deg, rgba(28,26,40,0.92), rgba(17,16,26,0.92))',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                borderColor: selected
                    ? '#c4b5fd'
                    : data.highlight
                      ? rgba(accent, 0.7)
                      : 'rgba(255,255,255,0.1)',
                boxShadow: selected
                    ? `0 0 0 1px #c4b5fd, 0 18px 40px -18px rgba(0,0,0,0.85), 0 0 24px -6px ${rgba(accent, 0.5)}`
                    : data.highlight
                      ? `0 0 22px -6px ${rgba(accent, 0.6)}, 0 14px 32px -18px rgba(0,0,0,0.8)`
                      : '0 12px 30px -18px rgba(0,0,0,0.8)',
            }}
        >
            {/* in/out ports — enlarged + generous hit area (see .hg-handle in
                hookgraph.css) so wiring the DAG is easy to grab and drop. */}
            <Handle
                type="target"
                position={Position.Left}
                className="hg-handle"
                style={{ width: 13, height: 13, left: -7 }}
            />
            <Handle
                type="source"
                position={Position.Right}
                className="hg-handle"
                style={{ width: 13, height: 13, right: -7 }}
            />

            {/* tag-coloured left rail */}
            <span
                className="pointer-events-none absolute inset-y-2 left-0 w-1 rounded-full"
                style={{ background: accent, boxShadow: `0 0 10px ${rgba(accent, 0.7)}` }}
            />

            <div className="pl-3.5 pr-2.5 py-2.5">
                {/* header: name + tag */}
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        {editing ? (
                            <input
                                ref={inputRef}
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onBlur={commit}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') commit()
                                    if (e.key === 'Escape') setEditing(false)
                                }}
                                className="nodrag nopan w-full rounded-md border border-violet-400/40 bg-black/40 px-1.5 py-0.5 text-[13px] font-semibold text-zinc-50 outline-none"
                                autoFocus
                            />
                        ) : (
                            <button
                                type="button"
                                title={readOnly ? data.name : 'Đổi tên (double-click)'}
                                onDoubleClick={() => !readOnly && setEditing(true)}
                                onClick={() => readOnly && data.onOpen?.(id)}
                                className="nodrag block w-full truncate text-left text-[13px] font-semibold leading-tight text-zinc-50"
                            >
                                {data.name || 'Block'}
                            </button>
                        )}
                    </div>
                    {tLabel && (
                        <span
                            className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                            style={{ color: accent, background: rgba(accent, 0.14), border: `1px solid ${rgba(accent, 0.35)}` }}
                        >
                            {tLabel}
                        </span>
                    )}
                </div>

                {/* source */}
                <div className="mt-2">
                    {hasSource ? (
                        <button
                            type="button"
                            onClick={() => data.onOpen?.(id)}
                            title={openUrl ?? undefined}
                            className="nodrag flex w-full items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-violet-400/40 hover:text-zinc-100"
                        >
                            <span className="text-violet-300/90">
                                <Icon d={data.url ? I.link : I.clock} size={12} />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-left">{blockSourceLabel(blockLike)}</span>
                            <span className="shrink-0 text-muted-foreground">
                                <Icon d={I.open} size={11} />
                            </span>
                        </button>
                    ) : readOnly ? (
                        <div className="rounded-lg border border-dashed border-white/10 px-2 py-1 text-[11px] text-muted-foreground">
                            Chưa gắn nguồn
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => data.onEdit?.(id)}
                            className="nodrag flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:border-violet-400/50 hover:text-violet-200"
                        >
                            <Icon d={I.plus} size={12} /> Gắn link / timecode
                        </button>
                    )}
                </div>

                {/* footer */}
                {(data.durationSec != null || status || !readOnly) && (
                    <div className="mt-2 flex items-center gap-1.5">
                        {data.durationSec != null && (
                            <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[9.5px] font-medium tabular-nums text-zinc-400">
                                {Math.round(data.durationSec)}s
                            </span>
                        )}
                        {status && (
                            <span
                                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9.5px] font-medium"
                                style={{ color: status.hex, background: rgba(status.hex, 0.14) }}
                            >
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.hex }} />
                                {status.label}
                            </span>
                        )}
                        <span className="ml-auto" />
                        {!readOnly && (
                            <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <button
                                    type="button"
                                    title="Sửa thuộc tính"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        data.onEdit?.(id)
                                    }}
                                    className="nodrag rounded-md p-1 text-zinc-400 hover:bg-white/10 hover:text-violet-200"
                                >
                                    <Icon d={I.pencil} size={12} />
                                </button>
                                <button
                                    type="button"
                                    title="Xoá block"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        data.onDelete?.(id)
                                    }}
                                    className="nodrag rounded-md p-1 text-zinc-400 hover:bg-rose-500/15 hover:text-rose-300"
                                >
                                    <Icon d={I.trash} size={12} />
                                </button>
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export const HookBlockNode = memo(HookBlockNodeInner)
HookBlockNode.displayName = 'HookBlockNode'
