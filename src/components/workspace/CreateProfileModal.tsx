'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Plus, Loader2, Users } from 'lucide-react'
import { createProfileForUser } from '@/actions/profile-actions'
import { toast } from 'sonner'

interface Props {
    open: boolean
    onClose: () => void
    /** Optional: called after successful create with the new profile ID */
    onCreated?: (profileId: string) => void
}

export default function CreateProfileModal({ open, onClose, onCreated }: Props) {
    const [name, setName] = useState('')
    const [creating, setCreating] = useState(false)

    async function handleCreate() {
        if (!name.trim()) {
            toast.error('Tên Profile không được để trống')
            return
        }
        if (name.trim().length > 50) {
            toast.error('Tên Profile không được quá 50 ký tự')
            return
        }

        setCreating(true)
        try {
            const result = await createProfileForUser(name.trim())
            if ((result as any).error) {
                toast.error((result as any).error)
            } else if ((result as any).success && (result as any).profile) {
                toast.success('Profile mới đã được tạo!')
                onClose()
                setName('')
                if (onCreated) {
                    onCreated((result as any).profile.id)
                } else {
                    // Fallback: hard reload to refresh switcher
                    window.location.reload()
                }
            }
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi tạo Profile')
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
                                    <Users className="w-4 h-4 text-violet-400" strokeWidth={1.5} />
                                </div>
                                <h3 className="text-lg font-bold text-zinc-100">Tạo Profile mới</h3>
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
                                    Tên Profile *
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && !creating && handleCreate()}
                                    placeholder="VD: Agency A, Team Marketing..."
                                    maxLength={50}
                                    className="w-full bg-zinc-900/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
                                    autoFocus
                                />
                                <p className="text-[10px] text-zinc-500 mt-1.5">{name.length}/50 ký tự</p>
                            </div>

                            {/* Info note */}
                            <div className="bg-violet-500/5 border border-violet-500/10 rounded-xl p-3">
                                <p className="text-xs text-zinc-400 leading-relaxed">
                                    Profile là một <span className="text-violet-400 font-bold">Team</span> độc lập với
                                    workspaces, members và data riêng. Bạn sẽ là người quản lý đầu tiên của profile.
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
                                    Tạo Profile
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
