'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { deleteProfileAction } from '@/actions/profile-actions'

type Props = {
    profileId: string
    profileName: string
    onClose: () => void
}

export default function DeleteProfileModal({ profileId, profileName, onClose }: Props) {
    const router = useRouter()
    const [confirmText, setConfirmText] = useState('')
    const [loading, setLoading] = useState(false)

    const canSubmit = confirmText === profileName && !loading

    async function handleDelete() {
        if (!canSubmit) return
        setLoading(true)
        try {
            const result = await deleteProfileAction(profileId)
            if ('error' in result && result.error) {
                toast.error(result.error)
                setLoading(false)
                return
            }
            toast.success('Profile đã được xóa. Có thể restore trong 30 ngày tại trang Profile Trash.')
            // Redirect away — profile gone from switcher
            window.location.href = '/welcome'
        } catch {
            toast.error('Lỗi khi xóa Profile.')
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-950 border border-red-500/30 rounded-2xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <h3 className="text-base font-bold text-red-300 flex items-center gap-2">
                        <Trash2 size={16} /> Xóa Profile
                    </h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-zinc-400">
                        <X size={16} />
                    </button>
                </div>
                <div className="p-5 space-y-4">
                    <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
                        <p className="text-[12px] text-red-200 leading-relaxed flex items-start gap-2">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                            <span>
                                <strong>Cảnh báo:</strong> Profile sẽ bị soft-delete và sau <strong>30 ngày</strong> tự động xóa vĩnh viễn cùng tất cả workspaces, tasks, members, files. Trong 30 ngày có thể restore tại trang <strong>Profile Trash</strong>.
                            </span>
                        </p>
                    </div>

                    <div>
                        <label className="text-xs text-zinc-400 font-medium pl-1">
                            Gõ tên Profile "<strong className="text-red-300">{profileName}</strong>" để xác nhận
                        </label>
                        <input
                            type="text"
                            autoFocus
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            className="mt-1.5 h-11 w-full rounded-full bg-white/[0.04] border border-white/10 px-[18px] text-[13px] text-zinc-200 outline-none focus:border-red-500/50"
                            placeholder={profileName}
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            onClick={onClose}
                            disabled={loading}
                            className="px-4 py-2 rounded-full text-[13px] text-zinc-300 hover:text-zinc-100 disabled:opacity-50"
                        >
                            Hủy
                        </button>
                        <button
                            onClick={handleDelete}
                            disabled={!canSubmit}
                            className="px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white text-[13px] font-semibold disabled:opacity-50 flex items-center gap-2"
                        >
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            Xóa Profile
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
