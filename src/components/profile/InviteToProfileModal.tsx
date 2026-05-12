'use client'

import { useState } from 'react'
import { X, Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { inviteToProfileAction } from '@/actions/profile-member-actions'

type Props = {
    profileId: string
    profileName: string
    onClose: () => void
    onSuccess: () => void
}

export default function InviteToProfileModal({ profileId, profileName, onClose, onSuccess }: Props) {
    const [usernameOrEmail, setUsernameOrEmail] = useState('')
    const [role, setRole] = useState<'ADMIN' | 'USER'>('USER')
    const [loading, setLoading] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!usernameOrEmail.trim()) return
        setLoading(true)
        try {
            const result = await inviteToProfileAction(profileId, usernameOrEmail.trim(), role)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Đã mời thành viên vào Profile.')
                onSuccess()
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-950 border border-[rgba(139,92,246,0.20)] rounded-2xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                        <UserPlus size={16} className="text-violet-400" /> Mời vào {profileName}
                    </h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-zinc-400">
                        <X size={16} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="text-xs text-zinc-400 font-medium pl-1">Tên đăng nhập hoặc Email</label>
                        <input
                            type="text"
                            autoFocus
                            value={usernameOrEmail}
                            onChange={(e) => setUsernameOrEmail(e.target.value)}
                            placeholder="username hoặc user@example.com"
                            className="mt-1.5 h-11 w-full rounded-full bg-white/[0.04] border border-[rgba(139,92,246,0.12)] px-[18px] text-[13px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-violet-500/50"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-zinc-400 font-medium pl-1">Role</label>
                        <div className="mt-1.5 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setRole('USER')}
                                className={`flex-1 py-2.5 px-4 rounded-full text-[13px] font-semibold border transition ${
                                    role === 'USER'
                                        ? 'bg-zinc-500/15 text-zinc-200 border-zinc-500/30'
                                        : 'bg-white/[0.02] text-zinc-500 border-white/5 hover:text-zinc-300'
                                }`}
                            >
                                User (Read-only)
                            </button>
                            <button
                                type="button"
                                onClick={() => setRole('ADMIN')}
                                className={`flex-1 py-2.5 px-4 rounded-full text-[13px] font-semibold border transition ${
                                    role === 'ADMIN'
                                        ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                                        : 'bg-white/[0.02] text-zinc-500 border-white/5 hover:text-zinc-300'
                                }`}
                            >
                                Admin
                            </button>
                        </div>
                        <p className="text-[11px] text-zinc-600 mt-2 pl-1 leading-relaxed">
                            <strong className="text-zinc-400">User:</strong> chỉ xem.{' '}
                            <strong className="text-zinc-400">Admin:</strong> tạo workspace + mời member (không xóa được). Admin chỉ tự động thấy workspace mới tạo sau khi được mời — workspace cũ cần Owner cấp riêng.
                        </p>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="px-4 py-2 rounded-full text-[13px] text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !usernameOrEmail.trim()}
                            className="px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-[13px] font-semibold disabled:opacity-50 flex items-center gap-2"
                        >
                            {loading && <Loader2 size={14} className="animate-spin" />}
                            Mời
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
