'use client'

// [Review module P2.5] Move-to / Copy-to destination picker (FR-B07/B08 §5,6). A modal
// folder tree (loaded from /api/review/tree). When the selection includes folders, the
// moved/copied folders + their whole subtrees are DISABLED as destinations (anti-cycle —
// can't move/copy a folder into itself or a descendant). Picking "Team" (the root node)
// targets the workspace root. Returns the chosen destination folder id.

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Folder as FolderIcon, ChevronRight, ChevronDown, Loader2, X, FolderInput, CopyPlus } from 'lucide-react'
import { REVIEW_MODULE_LABEL } from '@/lib/review/labels'

interface TreeNode {
    id: string
    parentId: string | null
    name: string
    hasChildren: boolean
}

export type MoveCopyMode = 'move' | 'copy'

export function MoveCopyDialog({
    open,
    mode,
    workspaceId,
    folderItemIds,
    onClose,
    onConfirm,
}: {
    open: boolean
    mode: MoveCopyMode
    workspaceId: string
    /** ids of the FOLDERS in the selection — their subtrees are disabled as targets. */
    folderItemIds: string[]
    onClose: () => void
    onConfirm: (targetFolderId: string) => void
}) {
    const [nodes, setNodes] = useState<TreeNode[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [selectedId, setSelectedId] = useState<string | null>(null)

    useEffect(() => {
        if (!open) return
        let alive = true
        setLoading(true)
        setError(null)
        setSelectedId(null)
        fetch(`/api/review/tree?workspaceId=${encodeURIComponent(workspaceId)}`, {
            credentials: 'same-origin',
            cache: 'no-store',
        })
            .then(async (res) => {
                if (!res.ok) throw new Error('Không tải được cây thư mục.')
                return (await res.json()) as { folders: TreeNode[] }
            })
            .then((body) => {
                if (!alive) return
                setNodes(body.folders)
                setExpanded(new Set(body.folders.filter((n) => n.parentId === null).map((n) => n.id)))
            })
            .catch((e) => {
                if (alive) setError(e instanceof Error ? e.message : 'Không tải được cây thư mục.')
            })
            .finally(() => {
                if (alive) setLoading(false)
            })
        return () => {
            alive = false
        }
    }, [open, workspaceId])

    const childrenOf = useMemo(() => {
        const m = new Map<string | null, TreeNode[]>()
        for (const n of nodes) {
            const list = m.get(n.parentId)
            if (list) list.push(n)
            else m.set(n.parentId, [n])
        }
        return m
    }, [nodes])

    // Disabled destinations = each moved/copied folder + its whole subtree (anti-cycle).
    const disabled = useMemo(() => {
        const set = new Set<string>()
        if (folderItemIds.length === 0) return set
        const stack = [...folderItemIds]
        while (stack.length) {
            const id = stack.pop()!
            if (set.has(id)) continue
            set.add(id)
            for (const child of childrenOf.get(id) ?? []) stack.push(child.id)
        }
        return set
    }, [folderItemIds, childrenOf])

    const roots = childrenOf.get(null) ?? []

    const renderNode = (node: TreeNode, depth: number): ReactNode => {
        const isRoot = node.parentId === null
        const kids = childrenOf.get(node.id) ?? []
        const isOpen = expanded.has(node.id)
        const isDisabled = disabled.has(node.id)
        const isSelected = selectedId === node.id
        return (
            <div key={node.id}>
                <div
                    className={`group flex items-center gap-1 rounded-lg pr-1.5 transition-colors ${
                        isSelected ? 'bg-violet-500/20 text-violet-100' : isDisabled ? 'text-muted-foreground' : 'text-zinc-300 hover:bg-white/[0.05]'
                    }`}
                    style={{ paddingLeft: 4 + depth * 14 }}
                >
                    {node.hasChildren ? (
                        <button
                            type="button"
                            onClick={() =>
                                setExpanded((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(node.id)) next.delete(node.id)
                                    else next.add(node.id)
                                    return next
                                })
                            }
                            className="flex h-7 w-5 items-center justify-center text-muted-foreground hover:text-zinc-200"
                            aria-label={isOpen ? 'Thu gọn' : 'Mở rộng'}
                        >
                            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </button>
                    ) : (
                        <span className="h-7 w-5" />
                    )}
                    <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => setSelectedId(node.id)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left disabled:cursor-not-allowed"
                        title={isDisabled ? 'Không thể chọn thư mục này' : isRoot ? REVIEW_MODULE_LABEL : node.name}
                    >
                        <FolderIcon size={14} className={`shrink-0 ${isSelected ? 'text-violet-300' : 'text-muted-foreground'}`} />
                        <span className="truncate text-[12.5px]">{isRoot ? REVIEW_MODULE_LABEL : node.name}</span>
                    </button>
                </div>
                {isOpen && kids.length > 0 && <div>{kids.map((k) => renderNode(k, depth + 1))}</div>}
            </div>
        )
    }

    const title = mode === 'move' ? 'Di chuyển tới' : 'Sao chép tới'
    const cta = mode === 'move' ? 'Di chuyển vào đây' : 'Sao chép vào đây'
    const CtaIcon = mode === 'move' ? FolderInput : CopyPlus

    return (
        <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
                <Dialog.Content
                    className="fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-[440px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/70 backdrop-blur-xl"
                    style={{ fontFamily: "var(--font-sans), 'Plus Jakarta Sans', sans-serif" }}
                >
                    <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
                        <Dialog.Title className="text-[14px] font-semibold text-zinc-100">{title}</Dialog.Title>
                        <Dialog.Close className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-100">
                            <X size={15} />
                        </Dialog.Close>
                    </div>

                    <div className="min-h-[220px] flex-1 overflow-y-auto p-2">
                        {loading ? (
                            <div className="flex items-center justify-center gap-2 py-16 text-[12.5px] text-muted-foreground">
                                <Loader2 size={14} className="animate-spin" /> Đang tải…
                            </div>
                        ) : error ? (
                            <p className="px-4 py-16 text-center text-[12.5px] text-red-300">{error}</p>
                        ) : roots.length === 0 ? (
                            <p className="px-4 py-16 text-center text-[12.5px] text-muted-foreground">Chưa có thư mục nào.</p>
                        ) : (
                            <div className="flex flex-col gap-0.5">{roots.map((r) => renderNode(r, 0))}</div>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg px-3.5 py-2 text-[12.5px] font-medium text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
                        >
                            Hủy
                        </button>
                        <button
                            type="button"
                            disabled={!selectedId}
                            onClick={() => selectedId && onConfirm(selectedId)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#8B5CF6] px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#7C3AED] disabled:opacity-40"
                        >
                            <CtaIcon size={14} /> {cta}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}
