'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
    Settings, Edit3, Trash2, RotateCcw, Loader2,
    Shield, AlertTriangle, Clock, Check, Plug, DollarSign,
} from 'lucide-react'
import { renameWorkspaceAction, deleteWorkspaceAction, restoreWorkspaceAction } from '@/actions/workspace-actions'
import { toast } from 'sonner'
import ConnectorsPanel from '@/components/settings/ConnectorsPanel'
import PricingRulesPanel from '@/components/settings/PricingRulesPanel'

type IntegrationRow = {
    provider: string
    accountEmail: string | null
    connectedAt: string | Date
    updatedAt: string | Date
}

type PricingRuleRow = {
    id: string
    name: string
    clientId: number | null
    ruleType: string
    config: any
    isDefault: boolean
    sortOrder: number
    client: { id: number; name: string } | null
}

type ClientOption = { id: number; name: string }

type TabId = 'general' | 'connectors' | 'pricing'

type Props = {
    workspaceId: string
    workspace: {
        id: string
        name: string
        description: string | null
        status: string
        deletedAt: string | null
        hardDeleteAfter: string | null
    }
    currentUserRole: string
    isGlobalAdmin: boolean
    memberCount: number
    /** [Quick Create] Connected integrations for the current user */
    integrations?: IntegrationRow[]
    /** [Quick Create] Pricing rules for this workspace */
    pricingRules?: PricingRuleRow[]
    /** [Quick Create] Clients available in this profile (for pricing rule scope) */
    clients?: ClientOption[]
}

export default function WorkspaceSettingsPanel({
    workspaceId, workspace, currentUserRole, isGlobalAdmin, memberCount,
    integrations = [], pricingRules = [], clients = [],
}: Props) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()
    const [editing, setEditing] = useState(false)
    const [newName, setNewName] = useState(workspace.name)
    const [renaming, setRenaming] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState('')
    const [deleting, setDeleting] = useState(false)
    const [restoring, setRestoring] = useState(false)

    const isOwner = currentUserRole === 'OWNER' || isGlobalAdmin
    const isSoftDeleted = workspace.status === 'SOFT_DELETED'

    // [Quick Create] Tab navigation — restore tab from URL on mount (post-OAuth redirect)
    const initialTab = (searchParams?.get('tab') as TabId | null) ?? 'general'
    const [activeTab, setActiveTab] = useState<TabId>(
        initialTab === 'connectors' || initialTab === 'pricing' ? initialTab : 'general',
    )

    const TABS: Array<{ id: TabId; label: string; icon: any }> = [
        { id: 'general', label: 'Tổng quan', icon: Settings },
        { id: 'connectors', label: 'Connectors', icon: Plug },
        { id: 'pricing', label: 'Pricing Rules', icon: DollarSign },
    ]

    async function handleRename() {
        if (!newName.trim() || newName.trim() === workspace.name) {
            setEditing(false)
            return
        }
        setRenaming(true)
        try {
            const result = await renameWorkspaceAction(workspaceId, newName.trim())
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Đã đổi tên workspace.')
                setEditing(false)
                startTransition(() => router.refresh())
            }
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi')
        } finally {
            setRenaming(false)
        }
    }

    async function handleDelete() {
        if (deleteConfirm !== workspace.name) return
        setDeleting(true)
        try {
            const result = await deleteWorkspaceAction(workspaceId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Workspace đã được đưa vào thùng rác. Có 30 ngày để khôi phục.')
                router.push('/workspace')
            }
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi')
        } finally {
            setDeleting(false)
        }
    }

    async function handleRestore() {
        setRestoring(true)
        try {
            const result = await restoreWorkspaceAction(workspaceId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Workspace đã được khôi phục.')
                startTransition(() => router.refresh())
            }
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi')
        } finally {
            setRestoring(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* [Quick Create] Tab nav */}
            <div className="flex items-center gap-1 p-1 rounded-full bg-zinc-900/40 border border-white/5 w-fit">
                {TABS.map((tab) => {
                    const TabIcon = tab.icon
                    const active = activeTab === tab.id
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-colors ${
                                active
                                    ? 'bg-violet-500/20 text-violet-200 border border-violet-500/40'
                                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                            }`}
                        >
                            <TabIcon size={13} />
                            {tab.label}
                        </button>
                    )
                })}
            </div>

            {/* Tab: Connectors */}
            {activeTab === 'connectors' && (
                <ConnectorsPanel workspaceId={workspaceId} integrations={integrations} />
            )}

            {/* Tab: Pricing Rules */}
            {activeTab === 'pricing' && (
                <PricingRulesPanel workspaceId={workspaceId} rules={pricingRules} clients={clients} />
            )}

            {/* Tab: General */}
            {activeTab === 'general' && (<>
            {/* Soft-deleted warning */}
            {isSoftDeleted && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" strokeWidth={2} />
                    <div className="flex-1">
                        <div className="text-sm font-bold text-red-400 mb-1">Workspace đã bị xóa</div>
                        <div className="text-xs text-red-300/70 leading-relaxed">
                            Workspace này đã bị xóa mềm.
                            {workspace.hardDeleteAfter && (
                                <> Sẽ bị xóa vĩnh viễn vào <strong>{new Date(workspace.hardDeleteAfter).toLocaleDateString('vi-VN')}</strong>.</>
                            )}
                        </div>
                        {isOwner && (
                            <button
                                onClick={handleRestore}
                                disabled={restoring}
                                className="mt-3 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2"
                            >
                                {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                Khôi phục Workspace
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* General Info */}
            <div className="bg-zinc-950/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-[80px] opacity-15 pointer-events-none bg-indigo-500" />

                <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mb-5 relative z-10">
                    <Settings className="w-5 h-5 text-indigo-400" strokeWidth={1.5} />
                    Thông tin Workspace
                </h3>

                <div className="space-y-4 relative z-10">
                    {/* Name */}
                    <div>
                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                            Tên Workspace
                        </label>
                        {editing ? (
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleRename()}
                                    className="flex-1 bg-zinc-900/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                    autoFocus
                                />
                                <button
                                    onClick={handleRename}
                                    disabled={renaming}
                                    className="px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    {renaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                </button>
                                <button
                                    onClick={() => { setEditing(false); setNewName(workspace.name) }}
                                    className="px-3 py-3 rounded-xl bg-white/5 border border-white/10 text-zinc-400 text-sm hover:bg-white/10 transition-colors"
                                >
                                    Hủy
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                <div className="bg-zinc-900/40 border border-white/5 rounded-xl px-4 py-3 text-sm text-zinc-200 flex-1">
                                    {workspace.name}
                                </div>
                                {isOwner && !isSoftDeleted && (
                                    <button
                                        onClick={() => setEditing(true)}
                                        className="p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all text-zinc-400 hover:text-zinc-200"
                                    >
                                        <Edit3 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="bg-zinc-900/30 border border-white/5 rounded-xl p-3">
                            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Thành viên</div>
                            <div className="text-lg font-bold text-zinc-100">{memberCount}</div>
                        </div>
                        <div className="bg-zinc-900/30 border border-white/5 rounded-xl p-3">
                            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Trạng thái</div>
                            <div className={`text-sm font-bold ${isSoftDeleted ? 'text-red-400' : 'text-emerald-400'}`}>
                                {isSoftDeleted ? 'Đã xóa' : 'Hoạt động'}
                            </div>
                        </div>
                        <div className="bg-zinc-900/30 border border-white/5 rounded-xl p-3">
                            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Vai trò của bạn</div>
                            <div className="text-sm font-bold text-indigo-400">{currentUserRole}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Danger Zone */}
            {isOwner && !isSoftDeleted && (
                <div className="bg-zinc-950/50 backdrop-blur-xl border border-red-500/10 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full blur-[80px] opacity-10 pointer-events-none bg-red-500" />

                    <h3 className="text-lg font-bold text-red-400 flex items-center gap-2 mb-4 relative z-10">
                        <Shield className="w-5 h-5" strokeWidth={1.5} />
                        Vùng nguy hiểm
                    </h3>

                    <div className="relative z-10 space-y-4">
                        <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4">
                            <div className="text-sm font-bold text-red-300 mb-1">Xóa Workspace</div>
                            <div className="text-xs text-zinc-400 leading-relaxed mb-3">
                                Workspace sẽ được đưa vào thùng rác 30 ngày trước khi bị xóa vĩnh viễn.
                                Tất cả task, dữ liệu và thành viên sẽ bị ảnh hưởng. Chỉ OWNER mới có thể khôi phục.
                            </div>
                            <div className="flex items-end gap-2">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-bold text-red-400/70 uppercase tracking-wider mb-1.5">
                                        Nhập <span className="font-mono">{workspace.name}</span> để xác nhận
                                    </label>
                                    <input
                                        type="text"
                                        value={deleteConfirm}
                                        onChange={e => setDeleteConfirm(e.target.value)}
                                        placeholder={workspace.name}
                                        className="w-full bg-zinc-900/60 border border-red-500/20 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-red-500/40 focus:ring-2 focus:ring-red-500/10 transition-all font-mono"
                                    />
                                </div>
                                <button
                                    onClick={handleDelete}
                                    disabled={deleteConfirm !== workspace.name || deleting}
                                    className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
                                >
                                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    Xóa Workspace
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            </>)}
        </div>
    )
}
