'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, Lock, Check, Briefcase } from 'lucide-react'
import { toast } from 'sonner'
import { grantWorkspaceAccessToAdmin, getOldWorkspacesForAdmin } from '@/actions/profile-member-actions'

type Workspace = {
    id: string
    name: string
    createdAt: string
    alreadyGranted: boolean
}

type Props = {
    profileId: string
    targetUserId: string
    targetUserName: string
    onClose: () => void
    onSuccess: () => void
}

export default function GrantWorkspaceAccessModal({ profileId, targetUserId, targetUserName, onClose, onSuccess }: Props) {
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState<string | null>(null)
    const [workspaces, setWorkspaces] = useState<Workspace[]>([])

    useEffect(() => {
        getOldWorkspacesForAdmin(profileId, targetUserId).then((result) => {
            if (result.error) {
                toast.error(result.error)
            } else {
                setWorkspaces(result.workspaces)
            }
            setLoading(false)
        })
    }, [profileId, targetUserId])

    async function handleGrant(wsId: string) {
        setSubmitting(wsId)
        try {
            const result = await grantWorkspaceAccessToAdmin(profileId, targetUserId, wsId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Đã cấp truy cập.')
                setWorkspaces((prev) => prev.map((w) => (w.id === wsId ? { ...w, alreadyGranted: true } : w)))
            }
        } finally {
            setSubmitting(null)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-950 border border-[rgba(139,92,246,0.20)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                    <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                        <Lock size={16} className="text-amber-400" /> Cấp truy cập workspace cho {targetUserName}
                    </h3>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-zinc-400">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-5 flex-1 overflow-y-auto">
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 mb-4">
                        <p className="text-[12px] text-amber-200 leading-relaxed">
                            Admin chỉ tự động thấy workspaces tạo SAU khi được promote. Danh sách dưới là các workspace CŨ — cần Owner cấp riêng từng cái.
                        </p>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 size={20} className="animate-spin text-zinc-500" />
                        </div>
                    ) : workspaces.length === 0 ? (
                        <p className="text-[13px] text-zinc-500 py-4 text-center">
                            Không có workspace cũ nào (Admin được promote trước khi profile có workspace).
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {workspaces.map((w) => (
                                <div
                                    key={w.id}
                                    className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5"
                                >
                                    <Briefcase size={14} className="text-violet-400 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[13px] font-semibold text-zinc-200 truncate">{w.name}</div>
                                        <div className="text-[11px] text-zinc-500">Tạo {w.createdAt.slice(0, 10)}</div>
                                    </div>
                                    {w.alreadyGranted ? (
                                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 font-medium">
                                            <Check size={12} /> Đã cấp
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleGrant(w.id)}
                                            disabled={submitting === w.id}
                                            className="px-3 py-1.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-semibold disabled:opacity-50 flex items-center gap-1.5"
                                        >
                                            {submitting === w.id && <Loader2 size={11} className="animate-spin" />}
                                            Cấp truy cập
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-white/5 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-full text-[13px] text-zinc-300 hover:text-zinc-100 bg-white/[0.06] hover:bg-white/[0.10]"
                    >
                        Đóng
                    </button>
                </div>
            </div>
        </div>
    )
}
