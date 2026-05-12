'use client'

import { useState } from 'react'
import { X, Loader2, ArrowRightLeft, Crown } from 'lucide-react'
import { toast } from 'sonner'
import { transferProfileOwnershipAction } from '@/actions/profile-member-actions'

type MemberItem = {
    id: string
    userId: string
    role: string
    user: {
        username: string
        nickname: string | null
        displayName: string | null
    }
}

type Props = {
    profileId: string
    profileName: string
    members: MemberItem[]
    onClose: () => void
    onSuccess: () => void
}

export default function TransferProfileOwnershipModal({ profileId, profileName, members, onClose, onSuccess }: Props) {
    const [selectedUserId, setSelectedUserId] = useState<string>('')
    const [confirmText, setConfirmText] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleSubmit() {
        if (!selectedUserId || confirmText !== profileName) return
        setLoading(true)
        try {
            const result = await transferProfileOwnershipAction(profileId, selectedUserId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Đã transfer ownership.')
                onSuccess()
            }
        } finally {
            setLoading(false)
        }
    }

    const canSubmit = selectedUserId && confirmText === profileName && !loading

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-950 border border-amber-500/30 rounded-2xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                        <ArrowRightLeft size={16} className="text-amber-400" /> Transfer Ownership
                    </h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-zinc-400">
                        <X size={16} />
                    </button>
                </div>
                <div className="p-5 space-y-4">
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
                        <p className="text-[12px] text-amber-200 leading-relaxed">
                            <Crown size={11} className="inline mr-1 mb-0.5" />
                            <strong>Cảnh báo:</strong> Bạn sẽ bị demote thành <strong>ADMIN</strong>.
                            Người mới sẽ có quyền cao nhất bao gồm xóa member và transfer lại sang người khác.
                        </p>
                    </div>

                    <div>
                        <label className="text-xs text-zinc-400 font-medium pl-1">Chọn người nhận quyền</label>
                        <select
                            value={selectedUserId}
                            onChange={(e) => setSelectedUserId(e.target.value)}
                            className="mt-1.5 h-11 w-full rounded-full bg-white/[0.04] border border-white/10 px-[18px] text-[13px] text-zinc-300 outline-none focus:border-amber-500/50"
                        >
                            <option value="">— Chọn member —</option>
                            {members.map((m) => (
                                <option key={m.userId} value={m.userId}>
                                    {m.user.displayName ?? m.user.nickname ?? m.user.username} ({m.role})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs text-zinc-400 font-medium pl-1">
                            Gõ tên Profile "<strong className="text-amber-300">{profileName}</strong>" để xác nhận
                        </label>
                        <input
                            type="text"
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            className="mt-1.5 h-11 w-full rounded-full bg-white/[0.04] border border-white/10 px-[18px] text-[13px] text-zinc-300 outline-none focus:border-amber-500/50"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            onClick={onClose}
                            disabled={loading}
                            className="px-4 py-2 rounded-full text-[13px] text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                        >
                            Hủy
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            className="px-4 py-2 rounded-full bg-amber-600 hover:bg-amber-500 text-white text-[13px] font-semibold disabled:opacity-50 flex items-center gap-2"
                        >
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            Transfer
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
