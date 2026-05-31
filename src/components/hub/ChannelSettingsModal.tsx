'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, Globe, Lock } from 'lucide-react'
import { toast } from 'sonner'
import {
    getChannelAccess,
    updateChannelSettings,
    setChannelMembers,
    type HubChannelDTO,
    type WorkspaceMemberOption,
} from '@/actions/channel-actions'
import type { ChannelVisibility, PostPolicy } from '@prisma/client'

export default function ChannelSettingsModal({
    workspaceId,
    channel,
    onClose,
    onSaved,
}: {
    workspaceId: string
    channel: HubChannelDTO
    onClose: () => void
    onSaved: (patch: { visibility: ChannelVisibility; postPolicy: PostPolicy }) => void
}) {
    const [visibility, setVisibility] = useState<ChannelVisibility>(channel.visibility)
    const [postPolicy, setPostPolicy] = useState<PostPolicy>(channel.postPolicy)
    const [wsMembers, setWsMembers] = useState<WorkspaceMemberOption[]>([])
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        let cancelled = false
        getChannelAccess(workspaceId, channel.id)
            .then((res) => {
                if (cancelled) return
                if ('error' in res) {
                    toast.error(res.error)
                    return
                }
                setWsMembers(res.workspaceMembers)
                setSelected(new Set(res.members.map((m) => m.userId)))
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [workspaceId, channel.id])

    function toggleMember(id: string) {
        setSelected((prev) => {
            const n = new Set(prev)
            if (n.has(id)) n.delete(id)
            else n.add(id)
            return n
        })
    }

    async function handleSave() {
        setSaving(true)
        try {
            const r1 = await updateChannelSettings(workspaceId, channel.id, { visibility, postPolicy })
            if ('error' in r1) {
                toast.error(r1.error)
                return
            }
            if (visibility === 'PRIVATE') {
                const r2 = await setChannelMembers(workspaceId, channel.id, Array.from(selected))
                if ('error' in r2) {
                    toast.error(r2.error)
                    return
                }
            }
            toast.success('Đã lưu cài đặt kênh')
            onSaved({ visibility, postPolicy })
            onClose()
        } finally {
            setSaving(false)
        }
    }

    const radio = (active: boolean) =>
        `flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
            active ? 'border-violet-500/50 bg-violet-500/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/5'
        }`

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <h3 className="text-lg font-bold text-zinc-100">Cài đặt kênh · #{channel.name}</h3>
                    <button onClick={onClose} className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-white/5">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-5 pb-5 space-y-5">
                    {/* Visibility */}
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Ai có thể xem</p>
                        <div className="space-y-2">
                            <label className={radio(visibility === 'PUBLIC')}>
                                <input type="radio" className="mt-1 accent-violet-500" checked={visibility === 'PUBLIC'} onChange={() => setVisibility('PUBLIC')} />
                                <div>
                                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100"><Globe className="w-3.5 h-3.5" /> Công khai</div>
                                    <p className="text-xs text-zinc-500">Mọi thành viên workspace đều thấy.</p>
                                </div>
                            </label>
                            <label className={radio(visibility === 'PRIVATE')}>
                                <input type="radio" className="mt-1 accent-violet-500" checked={visibility === 'PRIVATE'} onChange={() => setVisibility('PRIVATE')} />
                                <div>
                                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100"><Lock className="w-3.5 h-3.5" /> Riêng tư</div>
                                    <p className="text-xs text-zinc-500">Chỉ thành viên được thêm mới thấy (admin luôn thấy).</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Post policy */}
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">Ai có thể đăng</p>
                        <div className="space-y-2">
                            <label className={radio(postPolicy === 'EVERYONE')}>
                                <input type="radio" className="mt-1 accent-violet-500" checked={postPolicy === 'EVERYONE'} onChange={() => setPostPolicy('EVERYONE')} />
                                <div>
                                    <div className="text-sm font-semibold text-zinc-100">Mọi người</div>
                                    <p className="text-xs text-zinc-500">Ai xem được đều đăng được.</p>
                                </div>
                            </label>
                            <label className={radio(postPolicy === 'ADMINS_ONLY')}>
                                <input type="radio" className="mt-1 accent-violet-500" checked={postPolicy === 'ADMINS_ONLY'} onChange={() => setPostPolicy('ADMINS_ONLY')} />
                                <div>
                                    <div className="text-sm font-semibold text-zinc-100">Chỉ admin</div>
                                    <p className="text-xs text-zinc-500">Admin đăng, mọi người chỉ đọc (kiểu thông báo).</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Private members */}
                    {visibility === 'PRIVATE' && (
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
                                Thành viên · {selected.size}/{wsMembers.length}
                            </p>
                            {loading ? (
                                <div className="flex items-center gap-2 py-4 text-sm text-zinc-500">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Đang tải…
                                </div>
                            ) : (
                                <div className="max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-zinc-900/40 p-1">
                                    {wsMembers.map((m) => (
                                        <label key={m.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
                                            <input type="checkbox" className="w-4 h-4 accent-violet-500" checked={selected.has(m.id)} onChange={() => toggleMember(m.id)} />
                                            <span className="text-sm text-zinc-200 truncate">{m.displayName || m.username}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex gap-3 pt-1">
                        <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-300 text-sm font-semibold hover:bg-white/10">
                            Huỷ
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Lưu
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
