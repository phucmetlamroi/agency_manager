'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, Loader2, Plus, Trash2, Users, Check } from 'lucide-react'
import { toast } from 'sonner'
import { listRoles, createRole, updateRole, deleteRole, getRoleMembers, setRoleMembers, type CustomRoleDTO } from '@/actions/role-actions'
import type { StaffUser } from '@/lib/workspace-staff'

const COLORS = ['#a78bfa', '#f87171', '#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#94a3b8']

/**
 * [Chat Phase 2] Manage workspace custom roles (org tiers) — create/rename/recolor/
 * delete + assign members. Channel access is then refined per-channel in Cài đặt kênh.
 */
export default function RolesManagerModal({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
    const [roles, setRoles] = useState<CustomRoleDTO[]>([])
    const [loading, setLoading] = useState(true)
    const [newName, setNewName] = useState('')
    const [busy, setBusy] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [members, setMembers] = useState<Set<string>>(new Set())
    const [staff, setStaff] = useState<StaffUser[]>([])
    const [memberLoading, setMemberLoading] = useState(false)

    const refresh = useCallback(() => listRoles(workspaceId).then(setRoles).catch(() => {}), [workspaceId])
    useEffect(() => {
        setLoading(true)
        refresh().finally(() => setLoading(false))
    }, [refresh])

    async function handleCreate() {
        const name = newName.trim()
        if (!name) return
        setBusy(true)
        const res = await createRole(workspaceId, name)
        setBusy(false)
        if ('error' in res) {
            toast.error(res.error)
            return
        }
        setRoles((p) => [...p, res.role])
        setNewName('')
    }

    async function handleDelete(id: string) {
        if (!window.confirm('Xoá vai trò này? (Quyền đã gán ở các kênh cũng bị gỡ)')) return
        const res = await deleteRole(workspaceId, id)
        if ('error' in res) {
            toast.error(res.error)
            return
        }
        setRoles((p) => p.filter((r) => r.id !== id))
        if (editingId === id) setEditingId(null)
    }

    async function openMembers(id: string) {
        setEditingId(id)
        setMemberLoading(true)
        const res = await getRoleMembers(workspaceId, id)
        setMemberLoading(false)
        if ('error' in res) {
            toast.error(res.error)
            setEditingId(null)
            return
        }
        setStaff(res.staff)
        setMembers(new Set(res.members.map((m) => m.id)))
    }

    function toggleMember(uid: string) {
        setMembers((p) => {
            const n = new Set(p)
            if (n.has(uid)) n.delete(uid)
            else n.add(uid)
            return n
        })
    }

    async function saveMembers() {
        if (!editingId) return
        setBusy(true)
        const res = await setRoleMembers(workspaceId, editingId, Array.from(members))
        setBusy(false)
        if ('error' in res) {
            toast.error(res.error)
            return
        }
        toast.success('Đã lưu thành viên vai trò')
        refresh()
        setEditingId(null)
    }

    async function setColor(id: string, color: string) {
        setRoles((p) => p.map((r) => (r.id === id ? { ...r, color } : r)))
        await updateRole(workspaceId, id, { color })
    }

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                        <Users className="w-4 h-4 text-violet-400" /> Vai trò
                    </h3>
                    <button onClick={onClose} className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-white/5">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="px-5 pb-5 space-y-3">
                    <p className="text-xs text-zinc-500">Tạo vai trò (Editor, Manager, Khách…) rồi gán quyền theo vai trò ở từng kênh (mục “Phân quyền nâng cao” trong Cài đặt kênh).</p>
                    <div className="flex gap-2">
                        <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            placeholder="Tên vai trò mới"
                            maxLength={60}
                            className="flex-1 bg-zinc-900/70 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
                        />
                        <button onClick={handleCreate} disabled={busy || !newName.trim()} className="px-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40">
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex items-center gap-2 py-4 text-sm text-zinc-500">
                            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải…
                        </div>
                    ) : roles.length === 0 ? (
                        <p className="py-4 text-center text-xs text-zinc-500">Chưa có vai trò nào.</p>
                    ) : (
                        <div className="space-y-1.5">
                            {roles.map((r) => (
                                <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.02]">
                                    <div className="flex items-center gap-2 p-2.5">
                                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: r.color || '#a78bfa' }} />
                                        <span className="text-sm font-semibold text-zinc-100 flex-1 truncate">{r.name}</span>
                                        <span className="text-[11px] text-zinc-500">{r.memberCount} người</span>
                                        <button onClick={() => (editingId === r.id ? setEditingId(null) : openMembers(r.id))} className="p-1 rounded text-zinc-400 hover:text-violet-300" title="Thành viên">
                                            <Users className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => handleDelete(r.id)} className="p-1 rounded text-zinc-400 hover:text-red-400" title="Xoá">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    {editingId === r.id && (
                                        <div className="border-t border-white/10 p-2.5 space-y-2">
                                            <div className="flex items-center gap-1.5">
                                                {COLORS.map((c) => (
                                                    <button key={c} onClick={() => setColor(r.id, c)} className={`w-5 h-5 rounded-full border-2 ${r.color === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} />
                                                ))}
                                            </div>
                                            {memberLoading ? (
                                                <div className="flex items-center gap-2 py-2 text-xs text-zinc-500">
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải…
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-zinc-900/40 p-1">
                                                        {staff.map((s) => (
                                                            <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer">
                                                                <input type="checkbox" className="w-4 h-4 accent-violet-500" checked={members.has(s.id)} onChange={() => toggleMember(s.id)} />
                                                                <span className="text-sm text-zinc-200 truncate">{s.displayName || s.username}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                    <button onClick={saveMembers} disabled={busy} className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold py-1.5 disabled:opacity-40">
                                                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Lưu thành viên
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
