'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { Hash, Lock, Plus, Loader2, MessagesSquare } from 'lucide-react'
import { toast } from 'sonner'
import { createChannel, createCategory, getUnreadCounts, markChannelRead, type HubCategoryDTO, type HubChannelDTO } from '@/actions/channel-actions'
import ChannelView from './ChannelView'

interface Props {
    workspaceId: string
    initialCategories: HubCategoryDTO[]
    initialChannels: HubChannelDTO[]
    isAdmin: boolean
    currentUserId: string
}

export default function HubClient({ workspaceId, initialCategories, initialChannels, isAdmin, currentUserId }: Props) {
    const [categories, setCategories] = useState<HubCategoryDTO[]>(initialCategories)
    const [channels, setChannels] = useState<HubChannelDTO[]>(initialChannels)
    const [selectedId, setSelectedId] = useState<string | null>(initialChannels[0]?.id ?? null)

    const [showNewChannel, setShowNewChannel] = useState(false)
    const [newName, setNewName] = useState('')
    const [busy, setBusy] = useState(false)

    const selected = channels.find((c) => c.id === selectedId) ?? null

    // [Phase 2 · unread] per-channel unread counts (sidebar badges).
    const [unread, setUnread] = useState<Record<string, number>>({})

    const refreshUnread = useCallback(() => {
        getUnreadCounts(workspaceId).then(setUnread).catch(() => {})
    }, [workspaceId])

    useEffect(() => {
        refreshUnread()
        const id = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return
            refreshUnread()
        }, 15000)
        const onFocus = () => refreshUnread()
        window.addEventListener('focus', onFocus)
        return () => {
            clearInterval(id)
            window.removeEventListener('focus', onFocus)
        }
    }, [refreshUnread])

    function selectChannel(id: string) {
        setSelectedId(id)
        setUnread((prev) => {
            if (!prev[id]) return prev
            const n = { ...prev }
            delete n[id]
            return n
        })
        void markChannelRead(workspaceId, id)
    }

    // Group channels under their category (uncategorized first).
    const groups = useMemo(() => {
        const catIds = new Set(categories.map((c) => c.id))
        const byCat = new Map<string | null, HubChannelDTO[]>()
        for (const ch of channels) {
            const key = ch.categoryId && catIds.has(ch.categoryId) ? ch.categoryId : null
            if (!byCat.has(key)) byCat.set(key, [])
            byCat.get(key)!.push(ch)
        }
        const ordered: { id: string | null; name: string | null; channels: HubChannelDTO[] }[] = []
        if (byCat.has(null)) ordered.push({ id: null, name: null, channels: byCat.get(null)! })
        for (const cat of categories) {
            if (byCat.has(cat.id)) ordered.push({ id: cat.id, name: cat.name, channels: byCat.get(cat.id)! })
        }
        return ordered
    }, [channels, categories])

    async function handleCreateChannel() {
        const name = newName.trim()
        if (!name) return
        setBusy(true)
        try {
            const res = await createChannel(workspaceId, { name })
            if ('error' in res) {
                toast.error(res.error)
                return
            }
            setChannels((prev) => [...prev, res.channel])
            setSelectedId(res.channel.id)
            setNewName('')
            setShowNewChannel(false)
        } finally {
            setBusy(false)
        }
    }

    async function handleCreateCategory() {
        const name = window.prompt('Tên nhóm kênh mới')?.trim()
        if (!name) return
        const res = await createCategory(workspaceId, name)
        if ('error' in res) {
            toast.error(res.error)
            return
        }
        setCategories((prev) => [...prev, res.category])
    }

    return (
        <div className="flex h-[calc(100vh-160px)] min-h-[520px] gap-4">
            {/* Sidebar */}
            <aside className="w-64 shrink-0 rounded-2xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl p-3 flex flex-col">
                <div className="flex items-center justify-between px-2 py-2">
                    <div className="flex items-center gap-2 text-zinc-100 font-bold">
                        <MessagesSquare className="w-4 h-4 text-violet-400" />
                        Kênh
                    </div>
                    {isAdmin && (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleCreateCategory}
                                title="Tạo nhóm kênh"
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-colors text-[10px] font-bold uppercase tracking-wide"
                            >
                                Nhóm
                            </button>
                            <button
                                onClick={() => setShowNewChannel((v) => !v)}
                                title="Tạo kênh"
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-violet-300 hover:bg-white/5 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>

                {isAdmin && showNewChannel && (
                    <div className="px-1 pb-2">
                        <input
                            autoFocus
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreateChannel()
                                if (e.key === 'Escape') setShowNewChannel(false)
                            }}
                            placeholder="tên-kênh"
                            maxLength={80}
                            className="w-full bg-zinc-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
                        />
                        <button
                            onClick={handleCreateChannel}
                            disabled={busy || !newName.trim()}
                            className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold py-2 disabled:opacity-40"
                        >
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Tạo kênh
                        </button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto mt-1 space-y-3">
                    {groups.length === 0 && (
                        <p className="px-2 py-6 text-center text-xs text-zinc-500">Chưa có kênh nào.</p>
                    )}
                    {groups.map((g) => (
                        <div key={g.id ?? '__none'}>
                            {g.name && (
                                <p className="px-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{g.name}</p>
                            )}
                            <div className="space-y-0.5">
                                {g.channels.map((ch) => {
                                    const active = ch.id === selectedId
                                    const unreadCount = !active ? unread[ch.id] ?? 0 : 0
                                    return (
                                        <button
                                            key={ch.id}
                                            onClick={() => selectChannel(ch.id)}
                                            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                                                active
                                                    ? 'bg-violet-500/15 text-zinc-100'
                                                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                                            }`}
                                        >
                                            {ch.visibility === 'PRIVATE' ? (
                                                <Lock className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                                            ) : (
                                                <Hash className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                                            )}
                                            <span className={`truncate ${unreadCount > 0 ? 'text-zinc-100 font-semibold' : ''}`}>{ch.name}</span>
                                            {unreadCount > 0 && (
                                                <span className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-violet-600 text-white text-[10px] font-bold tabular-nums">
                                                    {unreadCount > 99 ? '99+' : unreadCount}
                                                </span>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 min-w-0 rounded-2xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl overflow-hidden">
                {selected ? (
                    <ChannelView
                        key={selected.id}
                        workspaceId={workspaceId}
                        channel={selected}
                        currentUserId={currentUserId}
                        isAdmin={isAdmin}
                        onChannelUpdated={(patch) =>
                            setChannels((prev) => prev.map((c) => (c.id === selected.id ? { ...c, ...patch } : c)))
                        }
                    />
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6">
                        <MessagesSquare className="w-10 h-10 text-zinc-700 mb-3" />
                        <p className="text-zinc-400 text-sm">
                            {isAdmin ? 'Tạo kênh đầu tiên để bắt đầu trao đổi.' : 'Chưa có kênh nào bạn có thể xem.'}
                        </p>
                    </div>
                )}
            </main>
        </div>
    )
}
