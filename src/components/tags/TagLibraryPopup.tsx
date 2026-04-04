'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
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

const POPUP_WIDTH = 420
const POPUP_HEIGHT_EST = 380
const MARGIN = 12

export function TagLibraryPopup({ isOpen, onClose, position, workspaceId, onTagsChanged }: TagLibraryPopupProps) {
    const [tags, setTags] = useState<TagItem[]>([])
    const [newTagName, setNewTagName] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingName, setEditingName] = useState('')
    const [loading, setLoading] = useState(false)
    const [mounted, setMounted] = useState(false)
    const popupRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // SSR safety: only render portal after mount
    useEffect(() => { setMounted(true) }, [])

    useEffect(() => {
        if (!isOpen) return
        loadTags()
        const timer = setTimeout(() => inputRef.current?.focus(), 100)
        return () => clearTimeout(timer)
    }, [isOpen, workspaceId])

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
            toast.success('Tag da duoc tao')
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
            toast.success('Tag da duoc cap nhat')
        }
    }

    const handleDelete = async (tagId: string) => {
        const res = await deleteTag(tagId)
        if (res.error) { toast.error(res.error); return }
        const updated = tags.filter(t => t.id !== tagId)
        setTags(updated)
        onTagsChanged?.(updated)
        toast.success('Tag da duoc xoa')
    }

    // ── Smart position: use right/bottom when overflowing ──
    const computeStyle = useCallback((): React.CSSProperties => {
        if (typeof window === 'undefined') return { left: position.x, top: position.y, width: POPUP_WIDTH }

        const vw = window.innerWidth
        const vh = window.innerHeight

        const style: React.CSSProperties = { width: POPUP_WIDTH }

        // Horizontal: if popup overflows right edge → anchor from the right
        if (position.x + POPUP_WIDTH + MARGIN > vw) {
            style.right = Math.max(MARGIN, vw - position.x)
        } else {
            style.left = Math.max(MARGIN, position.x)
        }

        // Vertical: if popup overflows bottom edge → anchor from the bottom
        if (position.y + POPUP_HEIGHT_EST + MARGIN > vh) {
            style.bottom = Math.max(MARGIN, vh - position.y)
        } else {
            style.top = Math.max(MARGIN, position.y)
        }

        return style
    }, [position.x, position.y])

    // Don't render on server or before mount
    if (!mounted) return null

    const popupContent = (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    ref={popupRef}
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className="fixed z-[9999] bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.05)] overflow-clip"
                    style={computeStyle()}
                >
                    {/* ── Header ── */}
                    <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between bg-zinc-900/30">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
                                <Tag className="w-3 h-3 text-indigo-400" strokeWidth={2} />
                            </div>
                            <h3 className="text-sm font-bold text-white tracking-tight">Tag Library</h3>
                            <span className="text-[10px] text-zinc-500 font-semibold ml-1">{tags.length}/15</span>
                        </div>
                        <button onClick={onClose} className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors">
                            <X className="w-4 h-4 text-zinc-500" />
                        </button>
                    </div>

                    {/* ── Two-column grid ── */}
                    <div className="grid grid-cols-2 gap-4 p-5">
                        {/* Left: Add new tag */}
                        <div className="flex flex-col gap-3">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                Them Tag Moi
                            </label>
                            <input
                                ref={inputRef}
                                type="text"
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                placeholder="Ten tag..."
                                maxLength={30}
                                className="px-3.5 py-2.5 text-sm bg-zinc-900/50 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                            />
                            <button
                                onClick={handleAdd}
                                disabled={loading || !newTagName.trim()}
                                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Plus className="w-4 h-4" strokeWidth={2} />
                                Them
                            </button>
                        </div>

                        {/* Right: Existing tags */}
                        <div className="flex flex-col gap-3">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                Danh sach ({tags.length})
                            </label>
                            <div className="space-y-1.5 max-h-[260px] overflow-y-auto custom-scrollbar">
                                {tags.length === 0 && (
                                    <p className="text-xs text-zinc-600 italic py-4 text-center">Chua co tag nao</p>
                                )}
                                <AnimatePresence>
                                    {tags.map((tag) => (
                                        <motion.div
                                            key={tag.id}
                                            layout
                                            initial={{ opacity: 0, x: 10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -10 }}
                                            className="group flex items-center justify-between p-2.5 bg-zinc-900/40 hover:bg-zinc-900/70 border border-white/5 rounded-lg transition-colors"
                                        >
                                            {editingId === tag.id ? (
                                                <div className="flex items-center gap-1.5 flex-1">
                                                    <input
                                                        value={editingName}
                                                        onChange={(e) => setEditingName(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleUpdate(tag.id)}
                                                        className="flex-1 px-2 py-1 text-xs bg-zinc-800 border border-white/10 rounded text-white outline-none"
                                                        autoFocus
                                                    />
                                                    <button onClick={() => handleUpdate(tag.id)} className="p-1 hover:bg-zinc-700 rounded text-emerald-400">
                                                        <Check className="w-3 h-3" />
                                                    </button>
                                                    <button onClick={() => setEditingId(null)} className="p-1 hover:bg-zinc-700 rounded text-zinc-500">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="text-sm text-zinc-200 font-medium truncate">{tag.name}</span>
                                                    <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity flex-shrink-0">
                                                        <button
                                                            onClick={() => { setEditingId(tag.id); setEditingName(tag.name) }}
                                                            className="p-1 hover:bg-zinc-700 rounded text-zinc-400 transition-colors"
                                                        >
                                                            <Pencil className="w-3 h-3" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(tag.id)}
                                                            className="p-1 hover:bg-zinc-700 rounded text-red-400 transition-colors"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )

    // ── CRITICAL: Render via Portal into document.body ──
    // This prevents the popup from affecting layout inside Radix Dialog Portal
    return createPortal(popupContent, document.body)
}
