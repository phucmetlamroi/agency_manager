'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Plus, Loader2, Layers, CalendarPlus } from 'lucide-react'
import { createWorkspaceAction, createNextMonthWithRollover } from '@/actions/workspace-actions'
import { toast } from 'sonner'

interface WorkspaceItem {
    id: string
    name: string
    description?: string | null
}

interface Props {
    open: boolean
    onClose: () => void
    /** Kept for call-site compat — no longer used since clients are profile-scoped. */
    workspaces?: WorkspaceItem[]
    /**
     * [Trial P2] When set, shows the "Tạo tháng tiếp theo" one-click rollover:
     * mints next month's workspace and copies every unfinished task forward
     * (same clients, editors, managers, pricing, assets — deadlines +1 month).
     */
    currentWorkspaceId?: string
    currentWorkspaceName?: string
}

// [Canonical Clients 2026-06] The "Sao chép khách hàng" clone section was
// REMOVED: clients are profile-scoped now, so every new workspace sees the
// profile's clients automatically — cloning would only mint the duplicate
// rows the canonical migration just merged.
export default function CreateWorkspaceModal({ open, onClose, currentWorkspaceId, currentWorkspaceName }: Props) {
    const router = useRouter()
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [creating, setCreating] = useState(false)
    const [rolling, setRolling] = useState(false)

    async function handleRollover() {
        if (!currentWorkspaceId) return
        setRolling(true)
        try {
            const result = await createNextMonthWithRollover(currentWorkspaceId)
            if (result.error) {
                toast.error(result.error)
            } else if (result.success && result.workspaceId) {
                toast.success(
                    result.tasksCopied
                        ? `Đã tạo "${result.name}" và chuyển ${result.tasksCopied} task chưa xong sang.`
                        : `Đã tạo "${result.name}". Chưa có task nào cần chuyển.`,
                )
                onClose()
                router.push(`/${result.workspaceId}/admin`)
            }
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi khi tạo tháng mới')
        } finally {
            setRolling(false)
        }
    }

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
                const newWsId = result.workspaceId
                toast.success('Workspace mới đã được tạo! Khách hàng của tổ chức sẽ tự hiển thị sẵn.')
                onClose()
                setName('')
                setDescription('')
                router.push(`/${newWsId}/admin`)
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
                        <div className="px-6 pb-6 space-y-4 relative z-10 max-h-[70vh] overflow-y-auto">
                            {/* [Trial P2] One-click monthly rollover — only shown when opened
                                from a workspace (admin has a "current month" context). */}
                            {currentWorkspaceId && (
                                <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <CalendarPlus className="w-4 h-4 text-emerald-400" strokeWidth={1.5} />
                                        <span className="text-sm font-bold text-emerald-300">Tạo tháng tiếp theo</span>
                                    </div>
                                    <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                                        Tự động tạo workspace tháng kế tiếp và <span className="text-emerald-300 font-semibold">chuyển toàn bộ task chưa hoàn tất</span> sang
                                        (giữ nguyên khách, editor, người quản lý, giá & link tài nguyên — hạn chót +1 tháng). Khỏi phải nhập lại từ đầu mỗi tháng.
                                    </p>
                                    <button
                                        onClick={handleRollover}
                                        disabled={rolling || creating}
                                        className="w-full px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {rolling ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}
                                        Tạo &amp; chuyển task từ {currentWorkspaceName ? `"${currentWorkspaceName}"` : 'tháng hiện tại'}
                                    </button>
                                    <div className="flex items-center gap-3 my-1 pt-3">
                                        <div className="flex-1 h-px bg-white/5" />
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">hoặc tạo mới</span>
                                        <div className="flex-1 h-px bg-white/5" />
                                    </div>
                                </div>
                            )}
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
                                    className="w-full bg-zinc-900/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-muted-foreground focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
                                    autoFocus
                                />
                                <p className="text-[10px] text-muted-foreground mt-1.5">{name.length}/50 ký tự</p>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                                    Mô tả <span className="text-muted-foreground">(tuỳ chọn)</span>
                                </label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="Mô tả ngắn về workspace này..."
                                    rows={3}
                                    maxLength={200}
                                    className="w-full bg-zinc-900/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-muted-foreground focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all resize-none"
                                />
                            </div>

                            {/* Info note */}
                            <div className="bg-violet-500/5 border border-violet-500/10 rounded-xl p-3">
                                <p className="text-xs text-zinc-400 leading-relaxed">
                                    Bạn sẽ tự động trở thành <span className="text-violet-400 font-bold">Chủ sở hữu</span> của workspace mới.
                                    Khách hàng của tổ chức sẽ <span className="text-violet-400 font-bold">tự hiển thị sẵn</span> — không cần sao chép.
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
