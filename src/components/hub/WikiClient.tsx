'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { FileText, Plus, Trash2, Loader2, ChevronRight, ChevronDown, BookOpen, Check } from 'lucide-react'
import { toast } from 'sonner'
import {
    getWikiPage,
    createWikiPage,
    updateWikiPage,
    deleteWikiPage,
    type WikiTreeNode,
    type WikiPageDTO,
} from '@/actions/wiki-actions'

const TiptapEditor = dynamic(() => import('@/components/tiptap/TiptapEditor'), {
    ssr: false,
    loading: () => <div className="p-6 text-sm text-zinc-500">Đang tải trình soạn thảo…</div>,
})

interface Props {
    workspaceId: string
    initialPages: WikiTreeNode[]
}

export default function WikiClient({ workspaceId, initialPages }: Props) {
    const [pages, setPages] = useState<WikiTreeNode[]>(initialPages)
    const [selectedId, setSelectedId] = useState<string | null>(initialPages[0]?.id ?? null)
    const [page, setPage] = useState<WikiPageDTO | null>(null)
    const [title, setTitle] = useState('')
    const [loadingPage, setLoadingPage] = useState(false)
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

    const selectedIdRef = useRef<string | null>(selectedId)
    const titleRef = useRef('')
    const contentRef = useRef('')
    const dirtyRef = useRef(false)
    const saveTimer = useRef<number | null>(null)

    useEffect(() => {
        selectedIdRef.current = selectedId
    }, [selectedId])

    const childrenOf = useMemo(() => {
        const ids = new Set(pages.map((p) => p.id))
        const m = new Map<string | null, WikiTreeNode[]>()
        for (const p of pages) {
            const key = p.parentId && ids.has(p.parentId) ? p.parentId : null
            if (!m.has(key)) m.set(key, [])
            m.get(key)!.push(p)
        }
        return m
    }, [pages])

    // Persist the in-flight edits (for the page currently in `selectedIdRef`).
    const flushSave = useCallback(() => {
        if (saveTimer.current) {
            clearTimeout(saveTimer.current)
            saveTimer.current = null
        }
        const id = selectedIdRef.current
        if (!id || !dirtyRef.current) return
        dirtyRef.current = false
        const t = titleRef.current
        updateWikiPage(workspaceId, id, { title: t, content: contentRef.current }).then((res) => {
            if (!('error' in res)) {
                setPages((prev) => prev.map((p) => (p.id === id ? { ...p, title: t.trim() || 'Trang mới' } : p)))
            }
        })
    }, [workspaceId])

    const scheduleSave = useCallback(() => {
        dirtyRef.current = true
        setSaveState('saving')
        if (saveTimer.current) clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(() => {
            const id = selectedIdRef.current
            if (!id) return
            dirtyRef.current = false
            const t = titleRef.current
            updateWikiPage(workspaceId, id, { title: t, content: contentRef.current }).then((res) => {
                if ('error' in res) {
                    setSaveState('idle')
                    toast.error(res.error)
                } else {
                    setSaveState('saved')
                    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, title: t.trim() || 'Trang mới' } : p)))
                }
            })
        }, 800)
    }, [workspaceId])

    // Flush pending edits on unmount.
    useEffect(() => () => flushSave(), [flushSave])

    // Load the selected page's content.
    useEffect(() => {
        if (!selectedId) {
            setPage(null)
            return
        }
        let cancelled = false
        setLoadingPage(true)
        getWikiPage(workspaceId, selectedId)
            .then((res) => {
                if (cancelled) return
                if ('error' in res) {
                    toast.error(res.error)
                    setPage(null)
                } else {
                    setPage(res.page)
                    setTitle(res.page.title)
                    titleRef.current = res.page.title
                    contentRef.current = res.page.content
                    dirtyRef.current = false
                    setSaveState('idle')
                }
            })
            .finally(() => {
                if (!cancelled) setLoadingPage(false)
            })
        return () => {
            cancelled = true
        }
    }, [workspaceId, selectedId])

    function selectPage(id: string) {
        if (id === selectedId) return
        flushSave()
        setSelectedId(id)
    }

    async function handleCreate(parentId: string | null) {
        const res = await createWikiPage(workspaceId, parentId ? { parentId } : {})
        if ('error' in res) {
            toast.error(res.error)
            return
        }
        const maxPos = pages.reduce((m, p) => Math.max(m, p.position), 0)
        setPages((prev) => [
            ...prev,
            { id: res.page.id, title: res.page.title, icon: res.page.icon, parentId: res.page.parentId, position: maxPos + 1 },
        ])
        if (parentId) setCollapsed((prev) => { const n = new Set(prev); n.delete(parentId); return n })
        flushSave()
        setSelectedId(res.page.id)
    }

    async function handleDelete(id: string) {
        if (!window.confirm('Xoá trang này? (Các trang con sẽ trở thành trang gốc)')) return
        const res = await deleteWikiPage(workspaceId, id)
        if ('error' in res) {
            toast.error(res.error)
            return
        }
        setPages((prev) => prev.filter((p) => p.id !== id))
        if (selectedId === id) setSelectedId(null)
    }

    function toggleCollapse(id: string) {
        setCollapsed((prev) => {
            const n = new Set(prev)
            if (n.has(id)) n.delete(id)
            else n.add(id)
            return n
        })
    }

    function renderNodes(parentKey: string | null, depth: number) {
        const nodes = childrenOf.get(parentKey) ?? []
        return nodes.map((node) => {
            const kids = childrenOf.get(node.id) ?? []
            const hasKids = kids.length > 0
            const isCollapsed = collapsed.has(node.id)
            const active = node.id === selectedId
            return (
                <div key={node.id}>
                    <div
                        className={`group flex items-center gap-1 rounded-lg pr-1 ${active ? 'bg-violet-500/15' : 'hover:bg-white/5'}`}
                        style={{ paddingLeft: 4 + depth * 14 }}
                    >
                        <button
                            type="button"
                            onClick={() => hasKids && toggleCollapse(node.id)}
                            className="w-4 h-6 grid place-items-center text-zinc-600 shrink-0"
                        >
                            {hasKids ? (
                                isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                            ) : null}
                        </button>
                        <button
                            type="button"
                            onClick={() => selectPage(node.id)}
                            className={`flex-1 min-w-0 flex items-center gap-2 py-1.5 text-sm ${active ? 'text-zinc-100' : 'text-zinc-400'}`}
                        >
                            <FileText className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                            <span className="truncate">{node.title || 'Trang mới'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleCreate(node.id)}
                            title="Thêm trang con"
                            className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-violet-300"
                        >
                            <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => handleDelete(node.id)}
                            title="Xoá"
                            className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-red-400"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    {hasKids && !isCollapsed && renderNodes(node.id, depth + 1)}
                </div>
            )
        })
    }

    return (
        <div className="flex h-[calc(100vh-160px)] min-h-[520px] gap-4">
            {/* Tree sidebar */}
            <aside className="w-64 shrink-0 rounded-2xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl p-3 flex flex-col">
                <div className="flex items-center justify-between px-2 py-2">
                    <div className="flex items-center gap-2 text-zinc-100 font-bold">
                        <BookOpen className="w-4 h-4 text-violet-400" /> Wiki
                    </div>
                    <button
                        onClick={() => handleCreate(null)}
                        title="Tạo trang"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-violet-300 hover:bg-white/5"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto mt-1">
                    {pages.length === 0 ? (
                        <p className="px-2 py-6 text-center text-xs text-zinc-500">Chưa có trang nào.</p>
                    ) : (
                        renderNodes(null, 0)
                    )}
                </div>
            </aside>

            {/* Editor */}
            <main className="flex-1 min-w-0 rounded-2xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl overflow-hidden flex flex-col">
                {!selectedId ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6">
                        <BookOpen className="w-10 h-10 text-zinc-700 mb-3" />
                        <p className="text-zinc-400 text-sm">Chọn một trang hoặc tạo trang mới để bắt đầu.</p>
                    </div>
                ) : loadingPage || !page ? (
                    <div className="h-full flex items-center justify-center text-zinc-500 gap-2 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> Đang tải…
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-3 px-6 pt-5 pb-3 border-b border-white/10 shrink-0">
                            <input
                                value={title}
                                onChange={(e) => {
                                    setTitle(e.target.value)
                                    titleRef.current = e.target.value
                                    scheduleSave()
                                }}
                                placeholder="Tiêu đề trang"
                                maxLength={120}
                                className="flex-1 bg-transparent text-2xl font-bold text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                            />
                            <span className="text-xs text-zinc-500 shrink-0 inline-flex items-center gap-1">
                                {saveState === 'saving' ? (
                                    <>
                                        <Loader2 className="w-3 h-3 animate-spin" /> Đang lưu…
                                    </>
                                ) : saveState === 'saved' ? (
                                    <>
                                        <Check className="w-3 h-3 text-emerald-400" /> Đã lưu
                                    </>
                                ) : null}
                            </span>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <TiptapEditor
                                key={selectedId}
                                content={page.content}
                                onChange={(html: string) => {
                                    contentRef.current = html
                                    scheduleSave()
                                }}
                                editable
                            />
                        </div>
                    </>
                )}
            </main>
        </div>
    )
}
