'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, Trash2, X, Check, Tag } from 'lucide-react'
import { createTag, updateTag, deleteTag, getTagsForUser } from '@/actions/tag-actions'
import { toast } from 'sonner'

type TagItem = { id: string; name: string }

interface TagLibraryPopupProps {
    isOpen: boolean
    onClose: () => void
    position: { x: number; y: number }
    workspaceId: string
    onTagsChanged?: (tags: TagItem[]) => void
}

const POPUP_WIDTH = 460
const POPUP_HEIGHT_EST = 400
const MARGIN = 16

export function TagLibraryPopup({ isOpen, onClose, position, workspaceId, onTagsChanged }: TagLibraryPopupProps) {
    const [tags, setTags] = useState<TagItem[]>([])
    const [newTagName, setNewTagName] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingName, setEditingName] = useState('')
    const [loading, setLoading] = useState(false)
    const popupRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isOpen) {
            loadTags()
            setTimeout(() => inputRef.current?.focus(), 100)
        }
    }, [isOpen])

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return
        const handler = (e: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [isOpen, onClose])

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [isOpen, onClose])

    const loadTags = async () => {
        const res = await getTagsForUser(workspaceId)
        if (res.tags) {
            setTags(res.tags)
            onTagsChanged?.(res.tags)
        }
    }

    const handleAdd = async () => {
        if (!newTagName.trim()) return
        setLoading(true)
        const res = await createTag(newTagName.trim(), workspaceId)
        setLoading(false)
        if (res.error) { toast.error(res.error); return }
        if (res.tag) {
            const updated = [...tags, res.tag]
            setTags(updated)
            onTagsChanged?.(updated)
            setNewTagName('')
            toast.success('Tag đã được tạo')
        }
    }

    const handleUpdate = async (tagId: string) => {
        if (!editingName.trim()) return
        const res = await updateTag(tagId, editingName.trim())
        if (res.error) { toast.error(res.error); return }
        if (res.tag) {
            const updated = tags.map(t => t.id === tagId ? { ...t, name: res.tag!.name } : t)
            setTags(updated)
            onTagsChanged?.(updated)
            setEditingId(null)
            toast.success('Tag đã được cập nhật')
        }
    }

    const handleDelete = async (tagId: string) => {
        const res = await deleteTag(tagId)
        if (res.error) { toast.error(res.error); return }
        const updated = tags.filter(t => t.id !== tagId)
        setTags(updated)
        onTagsChanged?.(updated)
        toast.success('Tag đã được xóa')
    }

    // ── Smart position clamping ──
    const getClampedPosition = useCallback(() => {
        if (typeof window === 'undefined') return { left: position.x, top: position.y }

        const vw = window.innerWidth
        const vh = window.innerHeight

        let left = position.x
        let top = position.y

        // If popup would overflow right edge → show to the LEFT of cursor
        if (left + POPUP_WIDTH + MARGIN > vw) {
            left = Math.max(MARGIN, left - POPUP_WIDTH - 8)
        } else {
            // Offset slightly to provide breathing room from cursor
            left = left + 8
        }

        // If popup would overflow bottom edge → shift upward
        if (top + POPUP_HEIGHT_EST + MARGIN > vh) {
            top = Math.max(MARGIN, vh - POPUP_HEIGHT_EST - MARGIN)
        }

        // Final viewport safety clamp
        left = Math.max(MARGIN, Math.min(left, vw - POPUP_WIDTH - MARGIN))
        top = Math.max(MARGIN, Math.min(top, vh - POPUP_HEIGHT_EST - MARGIN))

        return { left, top }
    }, [position.x, position.y])

    const { left, top } = getClampedPosition()

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    ref={popupRef}
                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    className="fixed z-[9999] bg-zinc-950/98 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_25px_70px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.05)] overflow-hidden"
                    style={{ left, top, width: POPUP_WIDTH }}
                >
                    {/* Header */}
                    <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between bg-zinc-900/40">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
                                <Tag className="w-3.5 h-3.5 text-indigo-400" strokeWidth={2.5} />
                            </div>
                            <h3 className="text-sm font-bold text-white tracking-tight">Tag Library</h3>
                            <span className="text-[10px] text-zinc-500 font-bold bg-zinc-800/50 px-1.5 py-0.5 rounded ml-1">{tags.length}/15</span>
                        </div>
                        <button onClick={onClose} className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors group">
                            <X className="w-4 h-4 text-zinc-500 group-hover:text-white" />
                        </button>
                    </div>

                    {/* Content Grid */}
                    <div className="grid grid-cols-2 gap-5 p-5">
                        {/* LEFT: Add Area */}
                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.15em] px-1">
                                    Thêm Tag Mới
                                </label>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={newTagName}
                                    onChange={(e) => setNewTagName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                    placeholder="Ví dụ: Urgent..."
                                    maxLength={25}
                                    className="w-full pl-3.5 pr-3.5 py-2.5 text-sm bg-zinc-900/80 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                                />
                            </div>
                            <button
                                onClick={handleAdd}
                                disabled={loading || !newTagName.trim()}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-br from-indigo-600 to-indigo-700 text-white text-xs font-bold rounded-xl hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all active:scale-95 disabled:opacity-30 disabled:grayscale"
                            >
                                <Plus className="w-4 h-4" strokeWidth={3} />
                                THÊM VÀO THƯ VIỆN
                            </button>
                            
                            <div className="p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                                <p className="text-[10px] text-indigo-300 leading-relaxed italic opacity-70">
                                    💡 Các thẻ trong thư viện sẽ xuất hiện trong menu Radial để bạn đánh dấu nhanh.
                                </p>
                            </div>
                        </div>

                        {/* RIGHT: List Area */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.15em] px-1">
                                Danh Sách ({tags.length})
                            </label>
                            <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1 custom-scrollbar">
                                {tags.length === 0 ? (
                                    <div className="h-32 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-xl bg-zinc-900/20">
                                        <Tag className="w-6 h-6 text-zinc-800 mb-2" />
                                        <p className="text-[11px] text-zinc-600 font-medium">Chưa có tag nào</p>
                                    </div>
                                ) : (
                                    <AnimatePresence initial={false}>
                                        {tags.map((tag) => (
                                            <motion.div
                                                key={tag.id}
                                                layout
                                                initial={{ opacity: 0, x: 10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -10 }}
                                                className="group flex items-center justify-between p-2.5 bg-zinc-900/40 hover:bg-zinc-900/80 border border-white/5 hover:border-white/10 rounded-xl transition-all"
                                            >
                                                {editingId === tag.id ? (
                                                    <div className="flex items-center gap-1.5 flex-1 p-0.5">
                                                        <input
                                                            value={editingName}
                                                            onChange={(e) => setEditingName(e.target.value)}
                                                            onKeyDown={(e) => e.key === 'Enter' && handleUpdate(tag.id)}
                                                            className="flex-1 px-2.5 py-1 text-xs bg-zinc-800 border border-indigo-500/30 rounded-lg text-white outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                            autoFocus
                                                        />
                                                        <button onClick={() => handleUpdate(tag.id)} className="p-1 px-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-md text-emerald-400 transition-colors">
                                                            <Check className="w-3 h-3" strokeWidth={3} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <span className="text-[13px] text-zinc-300 font-semibold truncate pl-1">{tag.name}</span>
                                                        <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-all">
                                                            <button
                                                                onClick={() => { setEditingId(tag.id); setEditingName(tag.name) }}
                                                                className="p-1.5 hover:bg-zinc-700/50 rounded-lg text-zinc-500 hover:text-zinc-200 transition-colors"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(tag.id)}
                                                                className="p-1.5 hover:bg-red-500/10 rounded-lg text-zinc-600 hover:text-red-400 transition-colors"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
