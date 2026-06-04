'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Plus, X, Check, Minus } from 'lucide-react'
import { toast } from 'sonner'
import { getChannelOverwrites, setChannelOverwrite, type ChannelOverwriteDTO } from '@/actions/channel-actions'
import type { StaffUser } from '@/lib/workspace-staff'

const ACTIONS = [
    { key: 'VIEW', label: 'Xem' },
    { key: 'POST', label: 'Đăng' },
    { key: 'MANAGE', label: 'Quản lý' },
] as const
type Eff = 'allow' | 'deny' | 'neutral'

/**
 * [Chat Phase 2] Per-channel ALLOW/DENY overwrite matrix (role or user × VIEW/POST/MANAGE).
 * Rendered inside ChannelSettingsModal. Empty rows are auto-removed (server deletes them).
 */
export default function ChannelPermissionsSection({ workspaceId, channelId }: { workspaceId: string; channelId: string }) {
    const [loading, setLoading] = useState(true)
    const [overwrites, setOverwrites] = useState<ChannelOverwriteDTO[]>([])
    const [roles, setRoles] = useState<Array<{ id: string; name: string; color: string | null }>>([])
    const [staff, setStaff] = useState<StaffUser[]>([])
    const [adding, setAdding] = useState(false)

    const load = useCallback(
        () =>
            getChannelOverwrites(workspaceId, channelId).then((res) => {
                if ('error' in res) {
                    toast.error(res.error)
                    return
                }
                setOverwrites(res.overwrites)
                setRoles(res.roles)
                setStaff(res.staff)
            }),
        [workspaceId, channelId],
    )
    useEffect(() => {
        setLoading(true)
        load().finally(() => setLoading(false))
    }, [load])

    function effOf(ow: ChannelOverwriteDTO, action: string): Eff {
        if (ow.deny.includes(action)) return 'deny'
        if (ow.allow.includes(action)) return 'allow'
        return 'neutral'
    }

    async function setEff(ow: ChannelOverwriteDTO, action: string, eff: Eff) {
        const allow = new Set(ow.allow)
        const deny = new Set(ow.deny)
        allow.delete(action)
        deny.delete(action)
        if (eff === 'allow') allow.add(action)
        if (eff === 'deny') deny.add(action)
        const nextAllow = Array.from(allow)
        const nextDeny = Array.from(deny)
        // optimistic — drop the row if it becomes fully neutral (server deletes it too)
        setOverwrites((p) =>
            p
                .map((o) => (o.subjectType === ow.subjectType && o.subjectId === ow.subjectId ? { ...o, allow: nextAllow, deny: nextDeny } : o))
                .filter((o) => o.allow.length > 0 || o.deny.length > 0),
        )
        const res = await setChannelOverwrite(workspaceId, channelId, ow.subjectType as 'ROLE' | 'USER', ow.subjectId, nextAllow, nextDeny)
        if ('error' in res) {
            toast.error(res.error)
            load()
        }
    }

    async function removeOverwrite(ow: ChannelOverwriteDTO) {
        setOverwrites((p) => p.filter((o) => !(o.subjectType === ow.subjectType && o.subjectId === ow.subjectId)))
        const res = await setChannelOverwrite(workspaceId, channelId, ow.subjectType as 'ROLE' | 'USER', ow.subjectId, [], [])
        if ('error' in res) {
            toast.error(res.error)
            load() // re-sync from server on failure
        }
    }

    async function addSubject(subjectType: 'ROLE' | 'USER', subjectId: string, subjectName: string) {
        setAdding(false)
        if (overwrites.some((o) => o.subjectType === subjectType && o.subjectId === subjectId)) return
        // seed with ALLOW VIEW so the new row is meaningful immediately
        setOverwrites((p) => [...p, { subjectType, subjectId, subjectName, allow: ['VIEW'], deny: [] }])
        const res = await setChannelOverwrite(workspaceId, channelId, subjectType, subjectId, ['VIEW'], [])
        if ('error' in res) {
            toast.error(res.error)
            load()
        }
    }

    const usedRole = new Set(overwrites.filter((o) => o.subjectType === 'ROLE').map((o) => o.subjectId))
    const usedUser = new Set(overwrites.filter((o) => o.subjectType === 'USER').map((o) => o.subjectId))
    const availRoles = roles.filter((r) => !usedRole.has(r.id))
    const availStaff = staff.filter((s) => !usedUser.has(s.id))

    return (
        <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">Phân quyền nâng cao</p>
            <p className="text-xs text-zinc-500 mb-2">Cho/cấm Xem · Đăng · Quản lý theo vai trò hoặc từng người (ghi đè mặc định của kênh).</p>
            {loading ? (
                <div className="flex items-center gap-2 py-2 text-sm text-zinc-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Đang tải…
                </div>
            ) : (
                <div className="space-y-2">
                    {overwrites.map((ow) => (
                        <div key={ow.subjectType + ow.subjectId} className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${ow.subjectType === 'ROLE' ? 'bg-violet-500/15 text-violet-300' : 'bg-sky-500/15 text-sky-300'}`}>
                                    {ow.subjectType === 'ROLE' ? 'Vai trò' : 'Người'}
                                </span>
                                <span className="text-sm font-semibold text-zinc-100 flex-1 truncate">{ow.subjectName}</span>
                                <button onClick={() => removeOverwrite(ow)} className="p-1 text-zinc-500 hover:text-red-400" title="Gỡ">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {ACTIONS.map((act) => {
                                    const eff = effOf(ow, act.key)
                                    return (
                                        <div key={act.key}>
                                            <div className="text-[10px] text-zinc-500 mb-1 text-center">{act.label}</div>
                                            <div className="flex rounded-lg border border-white/10 overflow-hidden">
                                                <button onClick={() => setEff(ow, act.key, 'deny')} className={`flex-1 grid place-items-center py-1 ${eff === 'deny' ? 'bg-red-500/25 text-red-300' : 'text-zinc-600 hover:bg-white/5'}`} title="Cấm">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => setEff(ow, act.key, 'neutral')} className={`flex-1 grid place-items-center py-1 border-x border-white/10 ${eff === 'neutral' ? 'bg-white/10 text-zinc-300' : 'text-zinc-600 hover:bg-white/5'}`} title="Mặc định">
                                                    <Minus className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => setEff(ow, act.key, 'allow')} className={`flex-1 grid place-items-center py-1 ${eff === 'allow' ? 'bg-emerald-500/25 text-emerald-300' : 'text-zinc-600 hover:bg-white/5'}`} title="Cho phép">
                                                    <Check className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}

                    {adding ? (
                        <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-2 max-h-48 overflow-y-auto">
                            {availRoles.length === 0 && availStaff.length === 0 && (
                                <p className="text-xs text-zinc-500 px-1 py-2 text-center">Hết đối tượng để thêm.</p>
                            )}
                            {availRoles.length > 0 && <p className="text-[10px] font-bold uppercase text-zinc-500 px-1 py-1">Vai trò</p>}
                            {availRoles.map((r) => (
                                <button key={r.id} onClick={() => addSubject('ROLE', r.id, r.name)} className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-white/5 text-left">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color || '#a78bfa' }} />
                                    <span className="text-sm text-zinc-200">{r.name}</span>
                                </button>
                            ))}
                            {availStaff.length > 0 && <p className="text-[10px] font-bold uppercase text-zinc-500 px-1 py-1 mt-1">Người</p>}
                            {availStaff.map((s) => (
                                <button key={s.id} onClick={() => addSubject('USER', s.id, s.displayName || s.username)} className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-white/5 text-left">
                                    <span className="text-sm text-zinc-200">{s.displayName || s.username}</span>
                                </button>
                            ))}
                            <button onClick={() => setAdding(false)} className="mt-1 w-full text-xs text-zinc-500 hover:text-zinc-300 py-1">Đóng</button>
                        </div>
                    ) : (
                        <button onClick={() => setAdding(true)} className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 text-zinc-400 hover:text-zinc-100 hover:border-white/30 text-sm py-2">
                            <Plus className="w-4 h-4" /> Thêm vai trò / người
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
