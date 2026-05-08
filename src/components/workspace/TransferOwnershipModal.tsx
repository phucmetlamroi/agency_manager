'use client'

import { useState } from 'react'
import { Crown, AlertTriangle, ArrowRightLeft, X, Loader2 } from 'lucide-react'
import { transferWorkspaceOwnership } from '@/actions/workspace-actions'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

type MemberItem = {
    id: string
    userId: string
    role: string
    user: {
        id: string
        username: string
        nickname: string | null
        email: string | null
        avatarUrl: string | null
    }
}

type Props = {
    workspaceId: string
    members: MemberItem[]
    currentUserId: string
    onClose: () => void
    onSuccess?: () => void
}

export default function TransferOwnershipModal({ workspaceId, members, currentUserId, onClose, onSuccess }: Props) {
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
    const [confirmText, setConfirmText] = useState('')
    const [loading, setLoading] = useState(false)

    // Filter out current user and show only non-GUEST members as candidates
    const candidates = members.filter(m =>
        m.user.id !== currentUserId && m.role !== 'GUEST'
    )

    const selectedMember = candidates.find(m => m.user.id === selectedUserId)
    const isConfirmed = confirmText === 'TRANSFER'

    async function handleTransfer() {
        if (!selectedUserId || !isConfirmed) return
        setLoading(true)
        try {
            const result = await transferWorkspaceOwnership(workspaceId, selectedUserId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Chuyển quyền sở hữu thành công!')
                onSuccess?.()
                onClose()
            }
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi không xác định')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-zinc-950/95 border border-white/10 rounded-2xl p-6 w-[90%] max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Ambient Glow */}
                <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-[80px] opacity-20 pointer-events-none bg-amber-500" />

                {/* Header */}
                <div className="relative z-10 flex items-center justify-between mb-5">
                    <h3 className="text-xl font-bold text-amber-400 flex items-center gap-2">
                        <Crown className="w-5 h-5" strokeWidth={2} />
                        Chuyển quyền sở hữu
                    </h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                        <X className="w-4 h-4 text-zinc-400" />
                    </button>
                </div>

                {/* Warning */}
                <div className="relative z-10 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-5 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" strokeWidth={2} />
                    <div className="text-sm text-amber-200/80 leading-relaxed">
                        Khi chuyển quyền sở hữu, bạn sẽ trở thành <strong>ADMIN</strong> và người được chọn sẽ trở thành <strong>OWNER</strong> duy nhất.
                        Hành động này <strong>không thể hoàn tác</strong> trừ khi OWNER mới chuyển lại.
                    </div>
                </div>

                {/* Member Selection */}
                <div className="relative z-10 mb-5">
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                        Chọn OWNER mới
                    </label>
                    {candidates.length === 0 ? (
                        <div className="text-sm text-zinc-500 bg-zinc-900/50 border border-white/5 rounded-xl p-4 text-center">
                            Không có thành viên nào đủ điều kiện. Hãy thêm thành viên trước.
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                            {candidates.map(m => {
                                const isSelected = m.user.id === selectedUserId
                                return (
                                    <button
                                        key={m.user.id}
                                        type="button"
                                        onClick={() => setSelectedUserId(m.user.id)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                                            isSelected
                                                ? 'bg-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/5'
                                                : 'bg-zinc-900/40 border-white/5 hover:border-white/10 hover:bg-zinc-900/60'
                                        }`}
                                    >
                                        <Avatar className="h-9 w-9 border border-white/10">
                                            <AvatarImage src={m.user.avatarUrl || `https://avatar.vercel.sh/${m.user.username}`} />
                                            <AvatarFallback className="bg-zinc-800 text-zinc-200 text-sm font-bold">
                                                {m.user.username[0].toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-zinc-100 truncate">
                                                {m.user.nickname || m.user.username}
                                            </div>
                                            <div className="text-[11px] text-zinc-500">
                                                @{m.user.username} · {m.role}
                                            </div>
                                        </div>
                                        {isSelected && (
                                            <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                                                <Crown className="w-3 h-3 text-white" />
                                            </div>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Confirmation Input */}
                {selectedMember && (
                    <div className="relative z-10 mb-5">
                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                            Nhập <span className="text-red-400 font-mono">TRANSFER</span> để xác nhận
                        </label>
                        <input
                            type="text"
                            value={confirmText}
                            onChange={e => setConfirmText(e.target.value)}
                            placeholder="TRANSFER"
                            className="w-full bg-zinc-900/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-all font-mono"
                        />
                    </div>
                )}

                {/* Actions */}
                <div className="relative z-10 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-400 font-bold text-sm hover:bg-white/10 hover:text-white transition-colors"
                    >
                        Hủy bỏ
                    </button>
                    <button
                        onClick={handleTransfer}
                        disabled={!selectedUserId || !isConfirmed || loading}
                        className="px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-amber-500/20 hover:shadow-amber-500/30 active:scale-[0.98]"
                    >
                        {loading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <ArrowRightLeft className="w-4 h-4" />
                        )}
                        Chuyển quyền sở hữu
                    </button>
                </div>
            </div>
        </div>
    )
}
