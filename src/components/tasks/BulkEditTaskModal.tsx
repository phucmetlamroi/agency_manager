"use client"

import React, { useState } from "react"
import { Dialog } from "@/components/ui/dialog"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { motion } from "framer-motion"
import { X, LayoutGrid, FolderOpen, StickyNote, Workflow, Loader2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { bulkUpdateTaskDetails, bulkUpdateTaskStatus } from "@/actions/bulk-task-actions"
import dynamic from "next/dynamic"

const TiptapEditor = dynamic(() => import("@/components/tiptap/TiptapEditor"), { ssr: false })

/* ───────────────────────────────────────────────────────────── */
/*  [Sprint Q] BulkEditTaskModal — dirty-tracking modal           */
/*                                                                */
/*  Dirty semantics:                                              */
/*   - User KHÔNG touch field → key absent in `draft` → preserve  */
/*   - User typed rồi xóa hết  → key present, value=''  → CLEAR   */
/*   - User chọn value mới     → key present, value=X   → UPDATE  */
/*                                                                */
/*  4 tabs: Workflow | Main | Assets | Notes                      */
/* ───────────────────────────────────────────────────────────── */

interface UserOption {
    id: string
    username: string
    nickname?: string | null
}

interface Props {
    isOpen: boolean
    onClose: () => void
    selectedTaskIds: string[]
    workspaceId: string
    /** Pre-loaded users list for assignee picker */
    users: UserOption[]
}

const STATUS_OPTIONS = [
    'Đang đợi giao',
    'Nhận task',
    'Đang thực hiện',
    'Revision',
    'Sửa frame',
    'Gửi lại',
    'Tạm ngưng',
    'Hoàn tất',
    'Đã hủy',
] as const

const TYPE_OPTIONS = ['Short form', 'Long form', 'Trial'] as const

type TabId = 'workflow' | 'main' | 'assets' | 'notes'

export function BulkEditTaskModal({ isOpen, onClose, selectedTaskIds, workspaceId, users }: Props) {
    const [activeTab, setActiveTab] = useState<TabId>('workflow')
    const [saving, setSaving] = useState(false)
    // Draft uses Record<string, any>. Key only present if user explicitly set it.
    const [draft, setDraft] = useState<Record<string, any>>({})

    // Helper: imperative setter — adds key to draft (even with empty value)
    const setField = (key: string, value: any) =>
        setDraft((prev) => ({ ...prev, [key]: value }))

    // Helper: remove key from draft (revert to "untouched")
    const unsetField = (key: string) =>
        setDraft((prev) => {
            const { [key]: _, ...rest } = prev
            return rest
        })

    const dirtyKeys = Object.keys(draft)
    const dirtyCount = dirtyKeys.length

    // Status-specific fields trigger dedicated bulk action with digest emails
    const STATUS_KEY = 'status'

    const handleSave = async () => {
        if (dirtyCount === 0) {
            toast.warning('Chưa chỉnh field nào — không có gì để update')
            return
        }
        setSaving(true)
        try {
            const { [STATUS_KEY]: status, ...nonStatusPatch } = draft
            const promises: Array<Promise<any>> = []

            if (Object.keys(nonStatusPatch).length > 0) {
                promises.push(
                    bulkUpdateTaskDetails(selectedTaskIds, nonStatusPatch, workspaceId),
                )
            }
            if (status !== undefined && status !== '') {
                promises.push(
                    bulkUpdateTaskStatus(selectedTaskIds, status as string, workspaceId),
                )
            }

            const results = await Promise.all(promises)

            // Check for errors
            const failures = results.filter((r: any) => r?.error)
            if (failures.length > 0) {
                toast.error(failures[0].error || 'Lỗi bulk update')
                return
            }

            // Aggregate counts for toast
            const statusResult = results.find((r: any) => 'rejectedCount' in (r || {})) as any
            let msg = `Đã cập nhật ${dirtyCount} field × ${selectedTaskIds.length} task`
            if (statusResult?.rejectedCount > 0) {
                msg += ` — ${statusResult.rejectedCount} task bị reject (status không hợp lệ)`
            }
            if (statusResult?.emailsSent > 0) {
                msg += ` · ${statusResult.emailsSent} email digest đã gửi`
            }
            toast.success(msg)

            // Reset draft + close
            setDraft({})
            onClose()
        } catch (err) {
            console.error('[BulkEdit]', err)
            toast.error('Lỗi bulk update — kiểm tra console')
        } finally {
            setSaving(false)
        }
    }

    const handleClose = () => {
        if (saving) return
        // Confirm if user has dirty changes
        if (dirtyCount > 0) {
            if (!window.confirm(`Bạn có ${dirtyCount} field chưa save. Đóng modal sẽ mất thay đổi. Tiếp tục?`)) return
        }
        setDraft({})
        onClose()
    }

    if (!isOpen) return null

    const inputBase =
        'w-full h-10 rounded-xl bg-white/[0.04] border border-violet-500/30 px-3 text-[13px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-violet-500'

    const labelBase = 'block text-[12px] font-semibold text-zinc-300 mb-1.5'
    const dirtyDot = (key: string) =>
        key in draft ? (
            <span
                className="inline-block w-2 h-2 rounded-full ml-2"
                style={{ background: '#8B5CF6', boxShadow: '0 0 8px rgba(139,92,246,0.6)' }}
                title="Đã chỉnh — sẽ apply"
            />
        ) : null

    const clearWarn = (key: string) =>
        key in draft && (draft[key] === '' || draft[key] === null) ? (
            <span className="ml-2 text-[10px] font-bold text-red-400 uppercase tracking-wide">
                ⚠ Sẽ XÓA
            </span>
        ) : null

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay asChild>
                    <motion.div
                        className="fixed inset-0"
                        style={{ zIndex: 9999, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    />
                </DialogPrimitive.Overlay>

                <DialogPrimitive.Content asChild>
                    <motion.div
                        className="fixed left-1/2 top-1/2 flex flex-col outline-none"
                        style={{
                            zIndex: 9999,
                            width: 720,
                            maxWidth: 'calc(100vw - 32px)',
                            maxHeight: '90vh',
                            borderRadius: 24,
                            background: 'rgba(10,10,10,0.95)',
                            border: '1px solid rgba(139,92,246,0.20)',
                            backdropFilter: 'blur(24px)',
                            boxShadow: '0 32px 80px rgba(0,0,0,0.70)',
                            x: '-50%',
                            y: '-50%',
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                        }}
                        initial={{ opacity: 0, scale: 0.96, y: '-48%', x: '-50%' }}
                        animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%' }}
                        exit={{ opacity: 0, scale: 0.96, y: '-48%', x: '-50%' }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {/* HEADER */}
                        <div className="flex flex-col gap-3 px-6 pt-6 pb-3 border-b border-white/5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-[18px] font-extrabold text-white">
                                        Bulk Edit
                                    </h2>
                                    <p className="text-[12px] text-zinc-400 mt-0.5">
                                        Đang sửa <strong className="text-violet-300">{selectedTaskIds.length}</strong> task ·{' '}
                                        {dirtyCount > 0 ? (
                                            <span className="text-amber-300">{dirtyCount} field sẽ apply</span>
                                        ) : (
                                            <span className="text-zinc-500">chưa chỉnh field nào</span>
                                        )}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    aria-label="Close"
                                    disabled={saving}
                                    className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.10] text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div
                                className="flex items-start gap-2 px-3 py-2 rounded-xl text-[11px]"
                                style={{
                                    background: 'rgba(245,158,11,0.06)',
                                    border: '1px solid rgba(245,158,11,0.15)',
                                    color: '#FBBF24',
                                }}
                            >
                                <AlertTriangle size={13} className="flex-shrink-0 mt-px" />
                                <span>
                                    Field bỏ trống = <strong>giữ nguyên dữ liệu cũ</strong> trên từng task. Nếu bạn type
                                    rồi xóa rỗng → field đó sẽ bị <strong>XÓA</strong> trên tất cả task.
                                </span>
                            </div>
                        </div>

                        {/* TABS */}
                        <div className="mx-6 my-3 flex items-center bg-white/[0.04] border border-white/5 rounded-full p-1">
                            {(
                                [
                                    { id: 'workflow', label: 'Workflow', icon: Workflow },
                                    { id: 'main', label: 'Main', icon: LayoutGrid },
                                    { id: 'assets', label: 'Assets', icon: FolderOpen },
                                    { id: 'notes', label: 'Notes', icon: StickyNote },
                                ] as const
                            ).map((tab) => {
                                const isActive = activeTab === tab.id
                                const Icon = tab.icon
                                // Show dirty badge per tab
                                const tabKeys: Record<TabId, string[]> = {
                                    workflow: ['status', 'type', 'assigneeId'],
                                    main: ['productLink', 'deadline', 'jobPriceUSD', 'value'],
                                    assets: ['resources', 'references', 'collectFilesLink'],
                                    notes: ['notes'],
                                }
                                const tabDirty = tabKeys[tab.id].some((k) => k in draft)
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTab(tab.id)}
                                        className={cn(
                                            'flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-[13px] font-semibold transition-colors relative',
                                            isActive
                                                ? 'bg-white/[0.08] text-white shadow-[0_2px_8px_rgba(139,92,246,0.15)]'
                                                : 'text-zinc-400 hover:text-zinc-200',
                                        )}
                                    >
                                        <Icon size={14} strokeWidth={1.8} />
                                        {tab.label}
                                        {tabDirty && (
                                            <span
                                                className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full"
                                                style={{ background: '#8B5CF6' }}
                                            />
                                        )}
                                    </button>
                                )
                            })}
                        </div>

                        {/* TAB CONTENT */}
                        <div className="flex-1 overflow-y-auto px-6 pb-4 custom-scrollbar">
                            {/* WORKFLOW TAB */}
                            {activeTab === 'workflow' && (
                                <div className="flex flex-col gap-4">
                                    {/* Status */}
                                    <div>
                                        <label className={labelBase}>
                                            Status
                                            {dirtyDot('status')}
                                            {clearWarn('status')}
                                        </label>
                                        <select
                                            value={draft.status ?? ''}
                                            onChange={(e) => {
                                                if (e.target.value === '') unsetField('status')
                                                else setField('status', e.target.value)
                                            }}
                                            className={inputBase}
                                        >
                                            <option value="">— Giữ nguyên —</option>
                                            {STATUS_OPTIONS.map((s) => (
                                                <option key={s} value={s}>
                                                    {s}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-[10px] text-zinc-500 mt-1">
                                            Status thay đổi sẽ trigger digest email tới recipient (1 email/người với danh sách task).
                                        </p>
                                    </div>

                                    {/* Type */}
                                    <div>
                                        <label className={labelBase}>
                                            Type
                                            {dirtyDot('type')}
                                        </label>
                                        <select
                                            value={draft.type ?? ''}
                                            onChange={(e) => {
                                                if (e.target.value === '') unsetField('type')
                                                else setField('type', e.target.value)
                                            }}
                                            className={inputBase}
                                        >
                                            <option value="">— Giữ nguyên —</option>
                                            {TYPE_OPTIONS.map((t) => (
                                                <option key={t} value={t}>
                                                    {t}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Assignee */}
                                    <div>
                                        <label className={labelBase}>
                                            Assignee
                                            {dirtyDot('assigneeId')}
                                            {clearWarn('assigneeId')}
                                        </label>
                                        <select
                                            value={draft.assigneeId ?? ''}
                                            onChange={(e) => {
                                                // Special: 'NONE' option means clear assignee → set to ''
                                                if (e.target.value === 'UNTOUCHED') unsetField('assigneeId')
                                                else if (e.target.value === 'NONE') setField('assigneeId', '')
                                                else setField('assigneeId', e.target.value)
                                            }}
                                            className={inputBase}
                                        >
                                            <option value="UNTOUCHED">— Giữ nguyên —</option>
                                            <option value="NONE">⚠ Bỏ assignee (clear)</option>
                                            {users.map((u) => (
                                                <option key={u.id} value={u.id}>
                                                    {u.nickname || u.username}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* MAIN TAB */}
                            {activeTab === 'main' && (
                                <div className="flex flex-col gap-4">
                                    {/* Delivery (productLink) */}
                                    <div>
                                        <label className={labelBase}>
                                            Delivery (productLink)
                                            {dirtyDot('productLink')}
                                            {clearWarn('productLink')}
                                        </label>
                                        <textarea
                                            value={draft.productLink ?? ''}
                                            onChange={(e) => setField('productLink', e.target.value)}
                                            placeholder="Để trống = giữ nguyên · Type rồi xóa = clear"
                                            rows={2}
                                            className="w-full rounded-xl bg-white/[0.04] border border-violet-500/30 px-3 py-2 text-[13px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-violet-500 resize-none"
                                            onFocus={() => {
                                                if (!('productLink' in draft)) setField('productLink', '')
                                            }}
                                        />
                                    </div>

                                    {/* Deadline */}
                                    <div>
                                        <label className={labelBase}>
                                            Deadline
                                            {dirtyDot('deadline')}
                                            {clearWarn('deadline')}
                                        </label>
                                        <input
                                            type="datetime-local"
                                            value={draft.deadline ?? ''}
                                            onChange={(e) => setField('deadline', e.target.value)}
                                            className={inputBase}
                                            onFocus={() => {
                                                if (!('deadline' in draft)) setField('deadline', '')
                                            }}
                                        />
                                    </div>

                                    {/* Finance */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelBase}>
                                                Client ($)
                                                {dirtyDot('jobPriceUSD')}
                                            </label>
                                            <input
                                                type="number"
                                                value={draft.jobPriceUSD ?? ''}
                                                onChange={(e) => {
                                                    const v = e.target.value === '' ? '' : Number(e.target.value)
                                                    setField('jobPriceUSD', v)
                                                }}
                                                placeholder="Giữ nguyên"
                                                className={inputBase}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelBase}>
                                                Staff (VND)
                                                {dirtyDot('value')}
                                            </label>
                                            <input
                                                type="number"
                                                value={draft.value ?? ''}
                                                onChange={(e) => {
                                                    const v = e.target.value === '' ? '' : Number(e.target.value)
                                                    setField('value', v)
                                                }}
                                                placeholder="Giữ nguyên"
                                                className={inputBase}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ASSETS TAB */}
                            {activeTab === 'assets' && (
                                <div className="flex flex-col gap-4">
                                    <div>
                                        <label className={labelBase}>
                                            Resources (RAW / B-Roll / Script / Submission)
                                            {dirtyDot('resources')}
                                            {clearWarn('resources')}
                                        </label>
                                        <input
                                            type="url"
                                            value={draft.resources ?? ''}
                                            onChange={(e) => setField('resources', e.target.value)}
                                            placeholder="Paste link..."
                                            className={inputBase}
                                            onFocus={() => {
                                                if (!('resources' in draft)) setField('resources', '')
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelBase}>
                                            References
                                            {dirtyDot('references')}
                                            {clearWarn('references')}
                                        </label>
                                        <input
                                            type="url"
                                            value={draft.references ?? ''}
                                            onChange={(e) => setField('references', e.target.value)}
                                            placeholder="Paste link..."
                                            className={inputBase}
                                            onFocus={() => {
                                                if (!('references' in draft)) setField('references', '')
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelBase}>
                                            Sample Project (collectFilesLink)
                                            {dirtyDot('collectFilesLink')}
                                            {clearWarn('collectFilesLink')}
                                        </label>
                                        <input
                                            type="url"
                                            value={draft.collectFilesLink ?? ''}
                                            onChange={(e) => setField('collectFilesLink', e.target.value)}
                                            placeholder="Paste link..."
                                            className={inputBase}
                                            onFocus={() => {
                                                if (!('collectFilesLink' in draft)) setField('collectFilesLink', '')
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* NOTES TAB */}
                            {activeTab === 'notes' && (
                                <div>
                                    <label className={labelBase}>
                                        Notes (rich text)
                                        {dirtyDot('notes')}
                                        {clearWarn('notes')}
                                    </label>
                                    <div
                                        className="rounded-xl border border-white/5 bg-white/[0.02] min-h-[260px] overflow-hidden"
                                        onClick={() => {
                                            if (!('notes' in draft)) setField('notes', '')
                                        }}
                                    >
                                        <TiptapEditor
                                            content={draft.notes ?? ''}
                                            onChange={(html) => setField('notes', html)}
                                        />
                                    </div>
                                    <p className="text-[10px] text-zinc-500 mt-1.5">
                                        Click vào editor để bắt đầu edit. Ghi rỗng → notes bị xóa trên tất cả task.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* FOOTER */}
                        <div
                            className="flex items-center justify-between gap-3 px-6 py-4 border-t border-white/5"
                            style={{ background: 'rgba(139,92,246,0.04)' }}
                        >
                            <div className="text-[12px] text-zinc-400">
                                {dirtyCount > 0 ? (
                                    <>
                                        Sẽ update <strong className="text-violet-200">{dirtyCount} field</strong> ×{' '}
                                        <strong className="text-violet-200">{selectedTaskIds.length} task</strong>
                                    </>
                                ) : (
                                    <span>Chưa có field nào được chỉnh</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    disabled={saving}
                                    className="px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.10] text-zinc-300 text-[13px] font-semibold transition-colors disabled:opacity-50"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving || dirtyCount === 0}
                                    className="px-5 py-2 rounded-full text-white text-[13px] font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                    style={{
                                        background:
                                            'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
                                        boxShadow:
                                            dirtyCount > 0 ? '0 8px 20px rgba(139,92,246,0.45)' : 'none',
                                    }}
                                >
                                    {saving ? (
                                        <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            Đang lưu…
                                        </>
                                    ) : (
                                        `Apply to ${selectedTaskIds.length} task`
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </Dialog>
    )
}
