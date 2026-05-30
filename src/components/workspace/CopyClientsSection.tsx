'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Loader2, ChevronDown } from 'lucide-react'
import { getWorkspaceClientsForCopy, type CopyClientItem } from '@/actions/workspace-clone-actions'

interface WorkspaceItem {
    id: string
    name: string
    description?: string | null
}

export interface CopyClientsState {
    enabled: boolean
    sourceId: string | null
    selectedIds: number[]
    copyPricing: boolean
}

interface Props {
    workspaces: WorkspaceItem[]
    onChange: (state: CopyClientsState) => void
}

/**
 * "Sao chép khách hàng từ workspace khác" section for the create-workspace modal.
 * Tick → pick a source workspace → fetch its clients → checklist tree (all checked
 * by default, parent/child linked) → optional "copy pricing". Emits state to the
 * parent which performs the clone after the workspace is created.
 */
export function CopyClientsSection({ workspaces, onChange }: Props) {
    const [enabled, setEnabled] = useState(false)
    // Default source = most recent workspace (list is oldest-first → last item).
    const [sourceId, setSourceId] = useState<string | null>(
        workspaces.length > 0 ? workspaces[workspaces.length - 1].id : null,
    )
    const [clients, setClients] = useState<CopyClientItem[]>([])
    const [checked, setChecked] = useState<Set<number>>(new Set())
    const [copyPricing, setCopyPricing] = useState(true)
    const [loading, setLoading] = useState(false)

    const byId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
    const childrenOf = useMemo(() => {
        const m = new Map<number | null, CopyClientItem[]>()
        const ids = new Set(clients.map((c) => c.id))
        for (const c of clients) {
            const key = c.parentId != null && ids.has(c.parentId) ? c.parentId : null
            if (!m.has(key)) m.set(key, [])
            m.get(key)!.push(c)
        }
        return m
    }, [clients])

    // Fetch clients when enabled + source changes.
    useEffect(() => {
        if (!enabled || !sourceId) {
            setClients([])
            setChecked(new Set())
            return
        }
        let cancelled = false
        setLoading(true)
        getWorkspaceClientsForCopy(sourceId).then((res) => {
            if (cancelled) return
            if ('clients' in res) {
                setClients(res.clients)
                setChecked(new Set(res.clients.map((c) => c.id))) // default: all checked
            } else {
                setClients([])
                setChecked(new Set())
            }
            setLoading(false)
        })
        return () => {
            cancelled = true
        }
    }, [enabled, sourceId])

    // Emit state up via ref so a non-memoised parent onChange can't cause a loop.
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    useEffect(() => {
        onChangeRef.current({ enabled, sourceId, selectedIds: Array.from(checked), copyPricing })
    }, [enabled, sourceId, checked, copyPricing])

    const descendantsOf = useCallback(
        (id: number): number[] => {
            const out: number[] = []
            const stack = [id]
            while (stack.length) {
                const cur = stack.pop()!
                for (const ch of childrenOf.get(cur) ?? []) {
                    out.push(ch.id)
                    stack.push(ch.id)
                }
            }
            return out
        },
        [childrenOf],
    )

    const toggle = useCallback(
        (id: number) => {
            setChecked((prev) => {
                const next = new Set(prev)
                if (next.has(id)) {
                    // uncheck id + all descendants
                    next.delete(id)
                    for (const d of descendantsOf(id)) next.delete(d)
                } else {
                    // check id + all ancestors (can't keep a child without its parent)
                    let cur: number | null = id
                    let guard = 0
                    while (cur != null && byId.has(cur) && guard < 8) {
                        next.add(cur)
                        cur = byId.get(cur)!.parentId
                        guard++
                    }
                }
                return next
            })
        },
        [descendantsOf, byId],
    )

    const selectAll = () => setChecked(new Set(clients.map((c) => c.id)))
    const selectNone = () => setChecked(new Set())

    const renderNodes = (parentKey: number | null, depth: number) => {
        const nodes = childrenOf.get(parentKey) ?? []
        return nodes.map((c) => (
            <div key={c.id}>
                <label
                    className="flex items-center gap-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer"
                    style={{ paddingLeft: 8 + depth * 18, paddingRight: 8 }}
                >
                    <input
                        type="checkbox"
                        checked={checked.has(c.id)}
                        onChange={() => toggle(c.id)}
                        className="w-4 h-4 rounded accent-violet-500 shrink-0"
                    />
                    <span className="text-sm text-zinc-200 truncate">{c.name}</span>
                </label>
                {renderNodes(c.id, depth + 1)}
            </div>
        ))
    }

    if (workspaces.length === 0) return null

    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="w-4 h-4 rounded accent-violet-500"
                />
                <span className="text-sm font-semibold text-zinc-200">Sao chép khách hàng từ workspace khác</span>
            </label>

            {enabled && (
                <div className="space-y-3 pt-1">
                    {/* Source workspace */}
                    <div className="relative">
                        <select
                            value={sourceId ?? ''}
                            onChange={(e) => setSourceId(e.target.value || null)}
                            className="w-full appearance-none bg-zinc-900/60 border border-white/10 rounded-xl px-4 py-2.5 pr-9 text-sm text-zinc-200 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                        >
                            {workspaces.map((w) => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                    </div>

                    {/* Client checklist */}
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm text-zinc-500">
                            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải khách hàng…
                        </div>
                    ) : clients.length === 0 ? (
                        <p className="text-xs text-zinc-500 py-4 text-center">Workspace này chưa có khách hàng.</p>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between mb-1 px-1">
                                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                                    Khách hàng · Đã chọn {checked.size}/{clients.length}
                                </span>
                                <div className="flex gap-2 text-[11px]">
                                    <button type="button" onClick={selectAll} className="text-violet-400 hover:text-violet-300">
                                        Chọn tất cả
                                    </button>
                                    <span className="text-zinc-600">·</span>
                                    <button type="button" onClick={selectNone} className="text-zinc-400 hover:text-zinc-300">
                                        Bỏ chọn
                                    </button>
                                </div>
                            </div>
                            <div className="max-h-52 overflow-y-auto rounded-lg border border-white/5 bg-zinc-900/40 p-1">
                                {renderNodes(null, 0)}
                            </div>
                        </div>
                    )}

                    {/* Pricing toggle */}
                    {clients.length > 0 && (
                        <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={copyPricing}
                                onChange={(e) => setCopyPricing(e.target.checked)}
                                className="w-4 h-4 rounded accent-violet-500"
                            />
                            <span className="text-xs text-zinc-300">Sao chép luôn bảng giá của khách</span>
                        </label>
                    )}
                </div>
            )}
        </div>
    )
}
