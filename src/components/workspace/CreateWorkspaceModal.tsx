'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Plus, Loader2, Layers } from 'lucide-react'
import { createWorkspaceAction } from '@/actions/workspace-actions'
import { toast } from 'sonner'

interface Props {
    open: boolean
    onClose: () => void
}

export default function CreateWorkspaceModal({ open, onClose }: Props) {
    const router = useRouter()
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [creating, setCreating] = useState(false)

    async function handleCreate() {
        if (!name.trim()) {
            toast.error('Tên Workspace không được để trống')
            return
        }
        if (name.trim().length > 50) {
            toast.error('Tên Workspace không được quá 50 ký tự')
            return
        }

        setCreating(true)
        try {
            const formData = new FormData()
            formData.set('name', name.trim())
            formData.set('description', description.trim())

            const result = await createWorkspaceAction(formData)
            if (result.error) {
                toast.error(result.error)
            } else if (result.success && result.workspaceId) {
                toast.success('Workspace mới đã được tạo!')
                onClose()
                setName('')
                setDescription('')
                router.push(`/${result.workspaceId}/admin`)
            }
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi tạo Workspace')
        } finally {
            setCreating(false)
        }
    }

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="relative w-full max-w-md mx-4 bg-zinc-950/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Ambient glow */}
                        <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full blur-[80px] opacity-20 pointer-events-none bg-violet-500" />

                        {/* Header */}
                        <div className="flex items-center justify-between px-6 pt-6 pb-4 relative z-10">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
                                    <Layers className="w-4.5 h-4.5 text-violet-400" strokeWidth={1.5} />
                                </div>
                                <h3 className="text-lg font-bold text-zinc-100">Tạo Workspace mới</h3>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl hover:bg-white/5 transition-colors text-zinc-400 hover:text-zinc-200"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Form */}
                        <div className="px-6 pb-6 space-y-4 relative z-10">
                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                                    Tên Workspace *
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && !creating && handleCreate()}
                                    placeholder="VD: Marketing Team, Design Squad..."
                                    maxLength={50}
                                    className="w-full bg-zinc-900/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
                                    autoFocus
                                />
                                <p className="text-[10px] text-zinc-500 mt-1.5">{name.length}/50 ký tự</p>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                                    Mô tả <span className="text-zinc-600">(tuỳ chọn)</span>
                                </label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="Mô tả ngắn về workspace này..."
                                    rows={3}
                                    maxLength={200}
                                    className="w-full bg-zinc-900/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all resize-none"
                                />
                            </div>

                            {/* Info note */}
                            <div className="bg-violet-500/5 border border-violet-500/10 rounded-xl p-3">
                                <p className="text-xs text-zinc-400 leading-relaxed">
                                    Bạn sẽ tự động trở thành <span className="text-violet-400 font-bold">OWNER</span> của workspace mới.
                                    Sau đó có thể mời thành viên từ trang Members.
                                </p>
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={onClose}
                                    className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-zinc-400 text-sm font-semibold hover:bg-white/10 transition-colors"
                                >
                                    Huỷ
                                </button>
                                <button
                                    onClick={handleCreate}
                                    disabled={creating || !name.trim()}
                                    className="flex-1 px-4 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {creating ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Plus className="w-4 h-4" />
                                    )}
                                    Tạo Workspace
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
