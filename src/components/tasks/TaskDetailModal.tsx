"use client"

import React, { useState, useEffect } from "react"
import { TaskWithUser } from "@/types/admin"
import { updateTaskDetails } from "@/actions/update-task-details"
import { bulkUpdateTaskDetails, bulkUpdateTaskResourceSubfields } from "@/actions/bulk-task-actions"
import { updateTaskStatus } from "@/actions/task-actions"
import { getHookGraph, saveHookGraph } from "@/actions/raw-footage-actions"
import type { HookGraph } from "@/lib/velox/hook-graph-types"
import { toast } from "sonner"
import { TaskReviewUploadSection } from "@/components/review/TaskReviewUploadSection"
import { Dialog } from "@/components/ui/dialog"
import dynamic from 'next/dynamic'
// [Hotfix 2026-06-13] plain 'dompurify' (browser-only, zero deps) replaces
// isomorphic-dompurify: the latter eagerly required jsdom on the SERVER
// during SSR of this client component → jsdom's html-encoding-sniffer
// require()s an ESM-only package → ERR_REQUIRE_ESM 500 on Vercel for every
// route importing this modal. All .sanitize() calls here run client-side
// only (the modal renders on user interaction, post-hydration).
import DOMPurify from 'dompurify'
import { cn } from "@/lib/utils"
import { taskTypeLabel } from "@/lib/display-labels"

// ── DOMPurify global hook: force every anchor in sanitized HTML to open in
// a new tab. Runs once at module load (DOMPurify is a singleton, so this
// applies to ALL .sanitize() calls in this module + downstream consumers).
// Guard with a global flag so HMR / multiple imports don't stack hooks.
declare global {
    // eslint-disable-next-line no-var
    var __taskDetailDompurifyLinkHookRegistered: boolean | undefined
}
if (typeof window !== 'undefined' && !globalThis.__taskDetailDompurifyLinkHookRegistered) {
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A') {
            node.setAttribute('target', '_blank')
            node.setAttribute('rel', 'noopener noreferrer')
        }
    })
    globalThis.__taskDetailDompurifyLinkHookRegistered = true
}
import { motion } from "framer-motion"
import {
    X, Pencil, LayoutGrid, FolderOpen, ExternalLink, Check, Plus,
    Lock, Play, Loader2,
} from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import TaskCommentColumn from "./TaskCommentColumn"

const TiptapEditor = dynamic(() => import('@/components/tiptap/TiptapEditor'), { ssr: false })
// [Hook Graph] React Flow is client-only + heavy — lazy-load so it ships only
// when a task with a Multi-Hook Map is opened.
const HookGraphViewer = dynamic(
    () => import('@/components/velox/hookgraph/HookGraphViewer').then((m) => m.HookGraphViewer),
    { ssr: false },
)
const HookGraphEditor = dynamic(
    () => import('@/components/velox/hookgraph/HookGraphEditor').then((m) => m.HookGraphEditor),
    { ssr: false },
)

/* ────────────────────────────────────────────────────────────────────── */
/*  Status / Type maps                                                     */
/* ────────────────────────────────────────────────────────────────────── */

const STATUS_COLORS: Record<string, { label: string; color: string; bg: string }> = {
    'Nhận task': { label: 'Nhận task', color: '#3B82F6', bg: 'rgba(59,130,246,0.10)' },
    'Đã nhận task': { label: 'Đã nhận task', color: '#3B82F6', bg: 'rgba(59,130,246,0.10)' },
    'Đang đợi giao': { label: 'Đang đợi giao', color: '#A855F7', bg: 'rgba(168,85,247,0.10)' },
    'Đang thực hiện': { label: 'Đang thực hiện', color: '#EAB308', bg: 'rgba(234,179,8,0.10)' },
    'Revision': { label: 'Sửa lại', color: '#EF4444', bg: 'rgba(239,68,68,0.10)' }, // [L18a] display only; value stays 'Revision'
    'Sửa frame': { label: 'Sửa frame', color: '#EC4899', bg: 'rgba(236,72,153,0.10)' },
    'Gửi lại': { label: 'Gửi lại', color: '#F97316', bg: 'rgba(249,115,22,0.10)' },
    'Tạm ngưng': { label: 'Tạm ngưng', color: '#71717A', bg: 'rgba(113,113,122,0.10)' },
    'Hoàn tất': { label: 'Hoàn tất', color: '#10B981', bg: 'rgba(16,185,129,0.10)' },
    'Quá hạn': { label: 'Quá hạn', color: '#DC2626', bg: 'rgba(220,38,38,0.10)' },
    'Đã hủy': { label: 'Đã hủy', color: '#52525B', bg: 'rgba(82,82,91,0.10)' },
}
const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
    'Short form': { color: '#38BDF8', bg: 'rgba(56,189,248,0.10)' },
    'Long form': { color: '#A78BFA', bg: 'rgba(139,92,246,0.10)' },
    'Trial': { color: '#FBBF24', bg: 'rgba(245,158,11,0.10)' },
    'Short': { color: '#38BDF8', bg: 'rgba(56,189,248,0.10)' },
    'Long': { color: '#A78BFA', bg: 'rgba(139,92,246,0.10)' },
}

function getStatusInfo(status: string) {
    return STATUS_COLORS[status] || { label: status, color: '#71717A', bg: 'rgba(113,113,122,0.10)' }
}
function getTypeInfo(type: string) {
    return TYPE_COLORS[type] || { color: '#A1A1AA', bg: 'rgba(161,161,170,0.10)' }
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                */
/* ────────────────────────────────────────────────────────────────────── */

function formatDate(d: Date | string | null): string {
    if (!d) return '—'
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return '—'
    const pad = (n: number) => (n < 10 ? '0' + n : String(n))
    return `${dt.getFullYear()} - ${pad(dt.getMonth() + 1)} - ${pad(dt.getDate())}  ·  ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

function parseContent(content: string | null): string {
    if (!content) return ''
    if (/<[a-z][\s\S]*>/i.test(content)) return content
    return content.split('\n').filter((l) => l.trim()).map((l) => `<p>${l}</p>`).join('')
}

function formatLink(link: string | null) {
    if (!link) return '#'
    if (link.startsWith('http')) return link
    return `https://${link}`
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Card wrapper                                                           */
/* ────────────────────────────────────────────────────────────────────── */

function Card({
    title,
    children,
    className = '',
    rightSlot,
}: {
    title?: string
    children: React.ReactNode
    className?: string
    rightSlot?: React.ReactNode
}) {
    return (
        <div
            className={cn(
                "rounded-2xl bg-white/[0.04] border border-[rgba(139,92,246,0.12)] p-4 flex flex-col",
                className,
            )}
        >
            {(title || rightSlot) && (
                <div className="flex items-center justify-between mb-3">
                    {title && (
                        <h4 className="text-[12px] font-bold uppercase tracking-wide text-zinc-400">
                            {title}
                        </h4>
                    )}
                    {rightSlot}
                </div>
            )}
            {children}
        </div>
    )
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Pills                                                                  */
/* ────────────────────────────────────────────────────────────────────── */

function StatusPill({ status }: { status: string }) {
    const s = getStatusInfo(status)
    return (
        <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold"
            style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}30` }}
        >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
            {s.label}
        </span>
    )
}
function TypePill({ type }: { type: string }) {
    if (!type) return null
    const t = getTypeInfo(type)
    return (
        <span
            className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold"
            style={{ background: t.bg, color: t.color, border: `1px solid ${t.color}30` }}
        >
            {taskTypeLabel(type)}
        </span>
    )
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Tab navigation                                                         */
/* ────────────────────────────────────────────────────────────────────── */

function TabNav({
    activeTab,
    onChange,
}: {
    activeTab: 'main' | 'assets'
    onChange: (tab: 'main' | 'assets') => void
}) {
    const tabs = [
        { id: 'main' as const, label: 'Chính', icon: LayoutGrid },
        { id: 'assets' as const, label: 'Tài nguyên', icon: FolderOpen },
    ]
    return (
        <div className="mx-6 my-4 flex items-center bg-white/[0.04] border border-white/5 rounded-full p-1">
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id
                const Icon = tab.icon
                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onChange(tab.id)}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-[13px] font-semibold transition-colors",
                            isActive
                                ? "bg-white/[0.08] text-white shadow-[0_2px_8px_rgba(139,92,246,0.15)]"
                                : "text-zinc-400 hover:text-zinc-200",
                        )}
                    >
                        <Icon size={14} strokeWidth={1.8} />
                        {tab.label}
                    </button>
                )
            })}
        </div>
    )
}

/* ────────────────────────────────────────────────────────────────────── */
/*  LinkRow — per-field inline edit + named hyperlink display              */
/* ────────────────────────────────────────────────────────────────────── */

function LinkRow({
    label,
    value,
    canEdit,
    onSave,
}: {
    label: string
    value: string
    canEdit: boolean
    onSave: (newValue: string) => Promise<void>
}) {
    const [isEditing, setIsEditing] = useState(false)
    const [draft, setDraft] = useState(value)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setDraft(value)
    }, [value])

    const startEdit = () => {
        setDraft(value)
        setIsEditing(true)
    }
    const cancelEdit = () => {
        setDraft(value)
        setIsEditing(false)
    }
    const handleConfirm = async () => {
        if (saving) return
        if (draft.trim() === value.trim()) {
            setIsEditing(false)
            return
        }
        setSaving(true)
        try {
            await onSave(draft.trim())
            setIsEditing(false)
        } finally {
            setSaving(false)
        }
    }

    if (isEditing) {
        return (
            <div className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
                <span className="text-[12px] font-medium text-zinc-300 flex-shrink-0 w-[120px]">
                    {label}
                </span>
                <input
                    type="url"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConfirm()
                        if (e.key === 'Escape') cancelEdit()
                    }}
                    autoFocus
                    placeholder="Dán link…"
                    className="flex-1 h-8 rounded-full bg-white/[0.06] border border-violet-500/40 px-3 text-[12px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-violet-500"
                />
                <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={saving}
                    title="Xác nhận"
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-[#8B5CF6] hover:bg-[#A855F7] text-white disabled:opacity-50 transition-colors"
                >
                    <Check size={13} strokeWidth={3} />
                </button>
                <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={saving}
                    title="Huỷ"
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-zinc-400 disabled:opacity-50 transition-colors"
                >
                    <X size={13} />
                </button>
            </div>
        )
    }

    return (
        <div className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0 group">
            <span className="text-[12px] font-medium text-zinc-300 flex-shrink-0">{label}</span>
            <div className="flex items-center gap-2 min-w-0">
                {value?.trim() ? (
                    <a
                        href={formatLink(value)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] text-violet-400 hover:text-violet-300 truncate max-w-[180px]"
                        title={value}
                    >
                        <span className="truncate">Xem {label}</span>
                        <ExternalLink size={11} className="flex-shrink-0" />
                    </a>
                ) : canEdit ? (
                    <button
                        type="button"
                        onClick={startEdit}
                        className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-violet-300 transition-colors"
                    >
                        <Plus size={11} />
                        Thêm link
                    </button>
                ) : (
                    <span className="text-[12px] text-zinc-600">Chưa có</span>
                )}
                {canEdit && value?.trim() && (
                    <button
                        type="button"
                        onClick={startEdit}
                        title="Sửa"
                        className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/[0.06]"
                    >
                        <Pencil size={11} className="text-zinc-500" />
                    </button>
                )}
            </div>
        </div>
    )
}

/* ────────────────────────────────────────────────────────────────────── */
/*  EditableCard — wraps a card with inline edit toggle (Delivery/Deadline/Finance) */
/* ────────────────────────────────────────────────────────────────────── */

function EditButton({ onClick, title }: { onClick: () => void; title?: string }) {
    const label = title ?? "Sửa"
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/[0.06] transition-colors"
        >
            <Pencil size={12} className="text-zinc-500 hover:text-violet-300" />
        </button>
    )
}

function ConfirmCancelGroup({
    onConfirm,
    onCancel,
    saving,
}: {
    onConfirm: () => void
    onCancel: () => void
    saving: boolean
}) {
    return (
        <div className="flex items-center gap-1.5">
            <button
                type="button"
                onClick={onConfirm}
                disabled={saving}
                title="Xác nhận"
                aria-label="Xác nhận"
                className="w-7 h-7 flex items-center justify-center rounded-full bg-[#8B5CF6] hover:bg-[#A855F7] text-white disabled:opacity-50 transition-colors"
            >
                <Check size={13} strokeWidth={3} />
            </button>
            <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                title="Huỷ"
                aria-label="Huỷ"
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-zinc-400 disabled:opacity-50 transition-colors"
            >
                <X size={13} />
            </button>
        </div>
    )
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Main Component                                                         */
/* ────────────────────────────────────────────────────────────────────── */

interface TaskDetailModalProps {
    task: TaskWithUser | null
    isOpen: boolean
    onClose: () => void
    isAdmin: boolean
    bulkSelectedIds?: string[]
    workspaceId: string
    /**
     * Sprint M — viewer's user id. Required to gate non-admin task details
     * behind a "Bắt đầu" button (assignee must explicitly start before reading).
     * If omitted (admin views), gate is disabled — admin always sees full details.
     */
    currentUserId?: string
}

export function TaskDetailModal({
    task,
    isOpen,
    onClose,
    isAdmin,
    workspaceId,
    currentUserId,
    bulkSelectedIds,
}: TaskDetailModalProps) {
    // [Bulk fix] Determine if we're in bulk mode — user ticked multiple rows
    // AND the currently-open task is one of them. Single edit clicks (no
    // checkbox tick) fall through as normal single update.
    const isBulkMode = !!(
        bulkSelectedIds &&
        bulkSelectedIds.length > 1 &&
        task &&
        bulkSelectedIds.includes(task.id)
    )
    const bulkCount = bulkSelectedIds?.length ?? 0
    const [activeTab, setActiveTab] = useState<'main' | 'assets'>('main')
    const [localTask, setLocalTask] = useState<TaskWithUser | null>(null)

    // [Hook Graph] The saved Multi-Hook Map for this task (fetched on open).
    const [hookGraph, setHookGraph] = useState<HookGraph | null>(null)
    const [editingMap, setEditingMap] = useState(false)
    const [editGraph, setEditGraph] = useState<HookGraph | null>(null)
    const [savingMap, setSavingMap] = useState(false)
    // [Hook Graph] The Assets tab defaults to the Resources grid; clicking the
    // RAW Assets row (when a Multi-Hook Map exists) opens the map panel.
    const [showMapPanel, setShowMapPanel] = useState(false)

    useEffect(() => {
        if (!isOpen || !task?.id) {
            setHookGraph(null)
            setEditingMap(false)
            setEditGraph(null)
            setShowMapPanel(false)
            return
        }
        let cancelled = false
        setEditingMap(false)
        setEditGraph(null)
        setShowMapPanel(false)
        getHookGraph(task.id)
            .then((res) => {
                if (cancelled) return
                if ('ok' in res && res.ok && res.graph && res.graph.blocks.length > 0) {
                    setHookGraph(res.graph)
                } else {
                    setHookGraph(null)
                }
            })
            .catch(() => {
                if (!cancelled) setHookGraph(null)
            })
        return () => {
            cancelled = true
        }
    }, [isOpen, task?.id])

    const handleEditMap = () => {
        setEditGraph(hookGraph)
        setEditingMap(true)
    }
    const handleCancelMap = () => {
        setEditingMap(false)
        setEditGraph(null)
    }
    const handleSaveMap = async () => {
        if (!task?.id || !editGraph) return
        setSavingMap(true)
        try {
            const res = await saveHookGraph(task.id, editGraph)
            if ('error' in res) {
                toast.error(res.error || 'Không lưu được Multi-Hook Map.')
            } else {
                setHookGraph(editGraph)
                setEditingMap(false)
                toast.success('Đã lưu Multi-Hook Map.')
            }
        } catch {
            toast.error('Lưu Multi-Hook Map thất bại.')
        } finally {
            setSavingMap(false)
        }
    }

    // Per-card edit states (only one open at a time, but state per card)
    const [editingDelivery, setEditingDelivery] = useState(false)
    const [editingDeadline, setEditingDeadline] = useState(false)
    const [editingFinance, setEditingFinance] = useState(false)
    const [editingNotes, setEditingNotes] = useState(false)
    // [2026-06-30] Rename the task/video title (admin-only, single-task).
    const [editingTitle, setEditingTitle] = useState(false)
    const [draftTitle, setDraftTitle] = useState('')
    const [savingCard, setSavingCard] = useState(false)

    // [Sprint M] "Bắt đầu" gate — non-admin assignee must click before viewing details
    const [starting, setStarting] = useState(false)

    // Drafts for cards in edit mode
    const [draftDelivery, setDraftDelivery] = useState('')
    const [draftDeadline, setDraftDeadline] = useState('')
    const [draftFinance, setDraftFinance] = useState({ jobPriceUSD: 0, value: 0 })
    const [draftNotes, setDraftNotes] = useState('')

    // Live form (keeps current values for display + base for save merging)
    const [form, setForm] = useState({
        productLink: '',
        deadline: '',
        jobPriceUSD: 0,
        value: 0,
        linkRaw: '',
        linkBroll: '',
        submissionFolder: '',
        references: '',
        scriptLink: '',
        collectFilesLink: '',
        notes: '',
    })

    /* ── Sync from task prop ── */
    useEffect(() => {
        if (!task) return
        setLocalTask(task)

        const resString = task.resources || task.fileLink || ''
        let raw = ''
        let broll = ''
        let submission = ''
        if (resString.startsWith('RAW:')) {
            const parts = resString.split('|')
            parts.forEach((p) => {
                const t = p.trim()
                if (t.startsWith('RAW:')) raw = t.replace('RAW:', '').trim()
                if (t.startsWith('BROLL:')) broll = t.replace('BROLL:', '').trim()
                if (t.startsWith('SUBMISSION:')) submission = t.replace('SUBMISSION:', '').trim()
            })
        } else {
            raw = resString
        }

        let refUrl = task.references || ''
        let scriptUrl = ''
        if (refUrl.startsWith('REF:')) {
            const refParts = refUrl.split('|')
            refParts.forEach((p) => {
                const t = p.trim()
                if (t.startsWith('REF:')) refUrl = t.replace('REF:', '').trim()
                if (t.startsWith('SCRIPT:')) scriptUrl = t.replace('SCRIPT:', '').trim()
            })
        }

        let deadlineStr = ''
        if (task.deadline) {
            const d = new Date(task.deadline)
            const pad = (n: number) => (n < 10 ? '0' + n : String(n))
            deadlineStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
        }

        setForm({
            productLink: task.productLink || '',
            deadline: deadlineStr,
            jobPriceUSD: task.jobPriceUSD || 0,
            value: task.value || 0,
            linkRaw: raw,
            linkBroll: broll,
            submissionFolder: task.submissionFolder || submission,
            references: refUrl,
            scriptLink: scriptUrl,
            collectFilesLink: task.collectFilesLink || '',
            notes: parseContent(task.notes_vi),
        })
        setActiveTab('main')
        setEditingDelivery(false)
        setEditingDeadline(false)
        setEditingFinance(false)
        setEditingNotes(false)
        setEditingTitle(false)
    }, [task])

    if (!isOpen || !localTask) return null

    /* ── Generic per-field save ── */
    // [Bulk fix] Route to bulkUpdateTaskDetails when modal opens with multiple
    // rows ticked — previously bulkSelectedIds was declared in props but never
    // used, so save always hit only the current task. Now: if isBulkMode → save
    // to ALL selected; else → single task save (existing behavior).
    const saveSingle = async (
        patch: Parameters<typeof updateTaskDetails>[1],
        successMsg = 'Đã cập nhật',
    ) => {
        if (isBulkMode && bulkSelectedIds) {
            const res = await bulkUpdateTaskDetails(bulkSelectedIds, patch, workspaceId) as any
            if (res?.success) {
                toast.success(`Đã cập nhật ${res.count ?? bulkSelectedIds.length} task`)
                return true
            }
            toast.error(res?.error ?? 'Lưu hàng loạt thất bại')
            return false
        }

        const res = await updateTaskDetails(localTask.id, patch, workspaceId)
        if (res?.success) {
            toast.success(successMsg)
            return true
        }
        toast.error('Lưu thất bại')
        return false
    }

    /* ── Resources card: re-pack + save ── */
    // [Bulk fix] CRITICAL data-integrity rule: in bulk mode this function must
    // NEVER re-pack the current task's `resources`/`references` strings and
    // apply them to other tasks (that would overwrite their unique RAW/BROLL/
    // SCRIPT/SUBMISSION/REF subfields with the current task's values). Instead
    // we send a surgical subfield update via bulkUpdateTaskResourceSubfields,
    // and the server fetches each task's current packed string + merges only
    // the subfield the user actually changed.
    const saveResource = async (key: 'linkRaw' | 'linkBroll' | 'scriptLink' | 'submissionFolder', newValue: string) => {
        // ─── Bulk mode: per-task surgical subfield merge (server-side) ───
        if (isBulkMode && bulkSelectedIds) {
            const subfields: any = {}
            if (key === 'linkRaw') subfields.linkRaw = newValue
            else if (key === 'linkBroll') subfields.linkBroll = newValue
            else if (key === 'scriptLink') subfields.scriptLink = newValue
            else if (key === 'submissionFolder') subfields.submissionFolder = newValue

            const res = await bulkUpdateTaskResourceSubfields(bulkSelectedIds, subfields, workspaceId) as any
            if (res?.success) {
                toast.success(`Đã cập nhật ${key} cho ${res.count ?? bulkSelectedIds.length} task`)
                // Optimistic update for current task only (others refresh on revalidate)
                setForm((prev) => ({ ...prev, [key]: newValue }))
            } else {
                toast.error(res?.error ?? 'Lưu hàng loạt thất bại')
            }
            return
        }

        // ─── Single mode: existing pack-and-save flow ───
        const next = { ...form, [key]: newValue }
        const combinedResources =
            next.linkRaw || next.linkBroll || next.submissionFolder
                ? `RAW: ${next.linkRaw.trim()} | BROLL: ${next.linkBroll.trim()} | SUBMISSION: ${next.submissionFolder.trim()}`
                : ''
        // For scriptLink we save into references packed string
        const combinedReferences = next.scriptLink
            ? `REF:${next.references.trim()} | SCRIPT:${next.scriptLink.trim()}`
            : next.references

        // submissionFolder is packed inside `resources` string (legacy backend format)
        const ok = await saveSingle({
            resources: combinedResources,
            references: combinedReferences,
        })
        if (ok) {
            setForm(next)
            setLocalTask((prev) =>
                prev ? { ...prev, resources: combinedResources, references: combinedReferences, submissionFolder: next.submissionFolder } : null,
            )
        }
    }

    const saveReference = async (key: 'references' | 'collectFilesLink', newValue: string) => {
        // ─── Bulk mode: surgical subfield merge ───
        if (isBulkMode && bulkSelectedIds) {
            const subfields: any = {}
            if (key === 'references') subfields.referenceLink = newValue
            else if (key === 'collectFilesLink') subfields.collectFilesLink = newValue

            const res = await bulkUpdateTaskResourceSubfields(bulkSelectedIds, subfields, workspaceId) as any
            if (res?.success) {
                toast.success(`Đã cập nhật ${key} cho ${res.count ?? bulkSelectedIds.length} task`)
                setForm((prev) => ({ ...prev, [key]: newValue }))
            } else {
                toast.error(res?.error ?? 'Lưu hàng loạt thất bại')
            }
            return
        }

        // ─── Single mode: existing pack-and-save flow ───
        const next = { ...form, [key]: newValue }
        const combinedReferences = next.scriptLink
            ? `REF:${next.references.trim()} | SCRIPT:${next.scriptLink.trim()}`
            : next.references

        const ok = await saveSingle({
            references: key === 'references' || key === 'collectFilesLink' ? combinedReferences : undefined,
            collectFilesLink: key === 'collectFilesLink' ? newValue : undefined,
        })
        if (ok) {
            setForm(next)
            setLocalTask((prev) =>
                prev ? { ...prev, references: combinedReferences, collectFilesLink: next.collectFilesLink } : null,
            )
        }
    }

    /* ── Card-level save handlers ── */
    /**
     * [One-Click Delivery Submit]
     * Editor flow: paste link → click ✓ → link saved + (if non-admin assignee in
     * 'Đang thực hiện', single-task mode) auto-transition to Revision.
     *
     * Replaces the old 2-step flow (save link + click "Nộp bài" footer button).
     * Server-side `updateTaskStatus` detects isUserDelivery from runtime state
     * (newStatus=Revision, oldStatus=Đang thực hiện, isAssignee, productLink) and
     * fires email taskDelivered + audit task.delivered automatically.
     *
     * Bulk mode: skip auto-transition (multi-task status change via marker check
     * is out of scope — admin can bulk-update status separately).
     */
    const handleSaveDelivery = async () => {
        const trimmed = draftDelivery.trim()
        if (!trimmed) {
            toast.error('Cần nhập link Delivery trước khi xác nhận.')
            return
        }

        setSavingCard(true)
        const ok = await saveSingle({ productLink: trimmed })
        if (!ok) {
            setSavingCard(false)
            return
        }

        // Update local state with saved productLink
        setForm((p) => ({ ...p, productLink: trimmed }))
        setLocalTask((p) => (p ? { ...p, productLink: trimmed } : null))
        setEditingDelivery(false)

        // Auto-submit gate: only fires in single-task mode for non-admin assignee
        // whose task is currently 'Đang thực hiện'. Admin save / bulk save /
        // status mismatch → just save link, no transition.
        const shouldAutoSubmit =
            !isAdmin &&
            !!currentUserId &&
            localTask.assigneeId === currentUserId &&
            localTask.status === 'Đang thực hiện' &&
            !isBulkMode

        if (shouldAutoSubmit) {
            try {
                const res = await updateTaskStatus(localTask.id, 'Revision', workspaceId)
                if (res?.success) {
                    toast.success('Đã nộp bài — admin sẽ review sớm. Deadline đã được tạm dừng.')
                    setLocalTask((prev) => (prev ? { ...prev, status: 'Revision', deadline: null } : prev))
                } else {
                    // Save succeeded in DB but transition failed — user can retry by
                    // re-saving the same link (idempotent on productLink, FSM still
                    // allows Đang thực hiện → Revision).
                    toast.error(res?.error || 'Link đã lưu, nhưng chưa chuyển status. Vui lòng thử lại.')
                }
            } catch {
                toast.error('Link đã lưu, nhưng chưa chuyển status. Vui lòng thử lại.')
            }
        }

        setSavingCard(false)
    }

    const handleSaveDeadline = async () => {
        setSavingCard(true)
        const ok = await saveSingle({ deadline: draftDeadline || undefined })
        if (ok) {
            setForm((p) => ({ ...p, deadline: draftDeadline }))
            setLocalTask((p) => (p ? { ...p, deadline: draftDeadline ? new Date(draftDeadline) : null } : null))
            setEditingDeadline(false)
        }
        setSavingCard(false)
    }

    const handleSaveFinance = async () => {
        if (!isAdmin) return
        setSavingCard(true)
        const ok = await saveSingle({
            jobPriceUSD: Number(draftFinance.jobPriceUSD),
            value: Number(draftFinance.value),
        })
        if (ok) {
            setForm((p) => ({ ...p, jobPriceUSD: Number(draftFinance.jobPriceUSD), value: Number(draftFinance.value) }))
            setLocalTask((p) => (p ? { ...p, jobPriceUSD: Number(draftFinance.jobPriceUSD), value: Number(draftFinance.value) } : null))
            setEditingFinance(false)
        }
        setSavingCard(false)
    }

    const handleSaveNotes = async () => {
        setSavingCard(true)
        const cleanNotes = DOMPurify.sanitize(draftNotes)
        const ok = await saveSingle({ notes: cleanNotes, notes_en: '' })
        if (ok) {
            setForm((p) => ({ ...p, notes: cleanNotes }))
            setLocalTask((p) => (p ? { ...p, notes_vi: cleanNotes, notes_en: null } : null))
            setEditingNotes(false)
        }
        setSavingCard(false)
    }

    const handleSaveTitle = async () => {
        const trimmed = draftTitle.trim()
        if (!trimmed) { toast.error('Tên không được để trống'); return }
        setSavingCard(true)
        const ok = await saveSingle({ title: trimmed }, 'Đã đổi tên video')
        if (ok) {
            setLocalTask((p) => (p ? { ...p, title: trimmed } : null))
            setEditingTitle(false)
        }
        setSavingCard(false)
    }

    /* ── Edit mode entry helpers (set drafts from current form) ── */
    const enterEditTitle = () => {
        setDraftTitle(localTask?.title ?? '')
        setEditingTitle(true)
    }
    const enterEditDelivery = () => {
        setDraftDelivery(form.productLink)
        setEditingDelivery(true)
    }
    const enterEditDeadline = () => {
        setDraftDeadline(form.deadline)
        setEditingDeadline(true)
    }
    const enterEditFinance = () => {
        setDraftFinance({ jobPriceUSD: form.jobPriceUSD, value: form.value })
        setEditingFinance(true)
    }
    const enterEditNotes = () => {
        setDraftNotes(form.notes)
        setEditingNotes(true)
    }

    /* ── [Sprint M] Start-task gate (non-admin assignee + status='Nhận task') ── */
    const isLocked =
        !isAdmin &&
        !!currentUserId &&
        localTask.assigneeId === currentUserId &&
        (localTask.status === 'Nhận task' || localTask.status === 'Đã nhận task')

    const handleStartTask = async () => {
        if (starting) return
        setStarting(true)
        try {
            const res = await updateTaskStatus(localTask.id, 'Đang thực hiện', workspaceId)
            if (res?.success) {
                toast.success('Đã bắt đầu task — chúc bạn làm việc hiệu quả!')
                setLocalTask((prev) => (prev ? { ...prev, status: 'Đang thực hiện' } : prev))
            } else {
                toast.error(res?.error || 'Không thể bắt đầu task. Vui lòng thử lại.')
            }
        } catch {
            toast.error('Không thể bắt đầu task. Vui lòng thử lại.')
        } finally {
            setStarting(false)
        }
    }

    /* ── Status info ── */
    const statusInfo = getStatusInfo(localTask.status)

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
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
                        className="fixed right-0 top-0 bottom-0 flex outline-none"
                        style={{
                            zIndex: 9999,
                            width: 1120,
                            maxWidth: '96vw',
                            background: 'rgba(10,10,10,0.97)',
                            borderLeft: '1px solid rgba(139,92,246,0.15)',
                            backdropFilter: 'blur(24px)',
                            boxShadow: '-32px 0 80px rgba(0,0,0,0.55)',
                        }}
                        initial={{ opacity: 0, x: 40 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 40 }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <div
                            className="absolute pointer-events-none"
                            style={{
                                top: -50, right: -50, width: 160, height: 160,
                                borderRadius: '50%',
                                background: statusInfo.color,
                                opacity: 0.08,
                                filter: 'blur(50px)',
                            }}
                        />

                        {/* [Trial P1] LEFT column — task info (was the centered modal body) */}
                        <div className="flex flex-col min-w-0" style={{ flex: 1, height: '100%', position: 'relative', zIndex: 1 }}>

                        {/* HEADER */}
                        <div className="flex flex-col gap-3 px-6 pt-6 pb-3 border-b border-white/5 relative z-[1]">
                            <div className="flex items-center justify-between">
                                <h2 className="text-[16px] font-extrabold text-white">Chi tiết Task</h2>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    aria-label="Đóng chi tiết task"
                                    className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.10] text-zinc-400 hover:text-white transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* [Bulk fix] Bulk mode indicator — shows user that any edit will apply to N tasks */}
                            {isBulkMode && (
                                <div
                                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
                                    style={{
                                        background: 'rgba(139,92,246,0.10)',
                                        border: '1px solid rgba(139,92,246,0.30)',
                                    }}
                                >
                                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-violet-500/20 text-violet-300 text-xs font-bold">
                                        {bulkCount}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[12px] font-bold text-violet-200">
                                            Sửa hàng loạt — đang chỉnh {bulkCount} task cùng lúc
                                        </div>
                                        <div className="text-[11px] text-violet-300/80">
                                            Mọi thay đổi sẽ được áp dụng cho toàn bộ task đã tick.
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col gap-2">
                                {isAdmin && editingTitle && !isBulkMode ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            autoFocus
                                            value={draftTitle}
                                            onChange={(e) => setDraftTitle(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleSaveTitle()
                                                else if (e.key === 'Escape') setEditingTitle(false)
                                            }}
                                            maxLength={200}
                                            placeholder="Tên video / task"
                                            className="flex-1 min-w-0 bg-zinc-900/70 border border-violet-500/40 rounded-lg px-3 py-1.5 text-[16px] font-bold text-white outline-none focus:border-violet-400"
                                        />
                                        <ConfirmCancelGroup onConfirm={handleSaveTitle} onCancel={() => setEditingTitle(false)} saving={savingCard} />
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <h3 className="text-[18px] font-extrabold text-white tracking-tight truncate">
                                            {localTask.title}
                                        </h3>
                                        {isAdmin && !isBulkMode && <EditButton onClick={enterEditTitle} title="Đổi tên video" />}
                                    </div>
                                )}
                                <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[12px] text-zinc-400">
                                    <span>Quản lý: <span className="text-zinc-200 font-medium">{(localTask.assignedBy as any)?.nickname || (localTask.assignedBy as any)?.username || '—'}</span></span>
                                    <span className="text-zinc-600">·</span>
                                    <span>Người làm: <span className="text-zinc-200 font-medium">{(localTask.assignee as any)?.nickname || (localTask.assignee as any)?.username || 'Chưa giao'}</span></span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <StatusPill status={localTask.status} />
                                    {localTask.type && <TypePill type={localTask.type} />}
                                </div>
                            </div>
                        </div>

                        {/* [Sprint M] Locked state — non-admin assignee must click "Bắt đầu" first */}
                        {isLocked ? (
                            <div className="flex-1 flex items-center justify-center px-6 pb-6 pt-4 relative z-[1]">
                                <div
                                    className="w-full max-w-md mx-auto rounded-3xl p-8 flex flex-col items-center text-center"
                                    style={{
                                        background: 'rgba(139,92,246,0.04)',
                                        border: '1px solid rgba(139,92,246,0.18)',
                                        boxShadow: '0 24px 64px rgba(0,0,0,0.40)',
                                    }}
                                >
                                    {/* Lock icon — pulse animation */}
                                    <div className="relative mb-5">
                                        <div
                                            className="w-16 h-16 rounded-2xl flex items-center justify-center"
                                            style={{
                                                background: 'rgba(139,92,246,0.12)',
                                                border: '1px solid rgba(139,92,246,0.25)',
                                            }}
                                        >
                                            <Lock className="w-7 h-7 text-violet-300" strokeWidth={1.8} />
                                        </div>
                                    </div>

                                    <h3
                                        className="text-[18px] font-extrabold text-white mb-2 tracking-tight"
                                        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                                    >
                                        Bạn chưa bắt đầu task này
                                    </h3>
                                    <p className="text-[13px] text-zinc-400 mb-7 leading-relaxed max-w-xs">
                                        Bấm <span className="text-violet-300 font-semibold">Bắt đầu</span> để xem chi tiết
                                        và chính thức nhận task. Trạng thái sẽ chuyển sang{' '}
                                        <span className="text-yellow-300 font-semibold">Đang thực hiện</span>.
                                    </p>

                                    {/* Start button — big violet gradient with pulse ring */}
                                    <button
                                        type="button"
                                        onClick={handleStartTask}
                                        disabled={starting}
                                        className="group relative inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full text-white font-bold transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
                                        style={{
                                            background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
                                            boxShadow: '0 12px 32px rgba(139,92,246,0.45)',
                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                            fontSize: 14,
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!starting) {
                                                e.currentTarget.style.background = 'linear-gradient(135deg, #9D6FFF 0%, #8B5CF6 100%)'
                                                e.currentTarget.style.boxShadow = '0 16px 40px rgba(139,92,246,0.60)'
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)'
                                            e.currentTarget.style.boxShadow = '0 12px 32px rgba(139,92,246,0.45)'
                                        }}
                                    >
                                        {starting ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Đang bắt đầu…
                                            </>
                                        ) : (
                                            <>
                                                <Play className="w-4 h-4" strokeWidth={2.5} />
                                                Bắt đầu
                                            </>
                                        )}
                                        {/* Pulse ring */}
                                        {!starting && (
                                            <span className="absolute inset-0 rounded-full border-2 border-violet-400/40 animate-ping pointer-events-none" />
                                        )}
                                    </button>

                                    <p className="text-[11px] text-zinc-500 mt-5">
                                        Một khi bắt đầu, deadline sẽ được tính từ thời điểm này.
                                    </p>
                                </div>
                            </div>
                        ) : (
                          <>
                        {/* TAB NAV */}
                        <TabNav activeTab={activeTab} onChange={setActiveTab} />

                        {/* TAB CONTENT */}
                        <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar relative z-[1]">
                            {/* TAB MAIN */}
                            {activeTab === 'main' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* DELIVERY card — editable by BOTH admin and user (assignee submits delivery link here) */}
                                    <Card
                                        title="Bàn giao"
                                        className="min-h-[220px]"
                                        rightSlot={
                                            !editingDelivery ? (
                                                <EditButton onClick={enterEditDelivery} />
                                            ) : (
                                                <ConfirmCancelGroup
                                                    onConfirm={handleSaveDelivery}
                                                    onCancel={() => setEditingDelivery(false)}
                                                    saving={savingCard}
                                                />
                                            )
                                        }
                                    >
                                        {editingDelivery ? (
                                            <textarea
                                                value={draftDelivery}
                                                onChange={(e) => setDraftDelivery(e.target.value)}
                                                placeholder="Dán link bàn giao hoặc ghi chú trạng thái…"
                                                className="flex-1 w-full rounded-xl bg-white/[0.04] border border-violet-500/40 p-3 text-[13px] text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-violet-500 resize-none min-h-[150px]"
                                                autoFocus
                                            />
                                        ) : form.productLink?.trim() ? (
                                            form.productLink.startsWith('http') ? (
                                                <a
                                                    href={formatLink(form.productLink)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-[13px] text-violet-400 hover:text-violet-300 inline-flex items-center gap-1"
                                                >
                                                    <span>Xem bản bàn giao</span>
                                                    <ExternalLink size={12} className="flex-shrink-0" />
                                                </a>
                                            ) : (
                                                <p className="text-[13px] text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                                    {form.productLink}
                                                </p>
                                            )
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={enterEditDelivery}
                                                className="self-start inline-flex items-center gap-1 text-[12px] text-zinc-500 hover:text-violet-300 transition-colors"
                                            >
                                                <Plus size={12} /> Thêm link bàn giao
                                            </button>
                                        )}

                                        {/* [Review P1.10 + P3.7] Up thẳng video review + sync task → Hoàn tất */}
                                        {localTask?.id && (
                                            <TaskReviewUploadSection
                                                taskId={localTask.id}
                                                taskStatus={localTask.status}
                                                onTaskCompleted={() =>
                                                    setLocalTask((prev) => (prev ? { ...prev, status: 'Hoàn tất' } : prev))
                                                }
                                            />
                                        )}
                                    </Card>

                                    {/* RIGHT — Deadline + Finance stacked */}
                                    <div className="flex flex-col gap-4">
                                        <Card
                                            title="Deadline"
                                            rightSlot={
                                                isAdmin && !editingDeadline ? (
                                                    <EditButton onClick={enterEditDeadline} />
                                                ) : editingDeadline ? (
                                                    <ConfirmCancelGroup
                                                        onConfirm={handleSaveDeadline}
                                                        onCancel={() => setEditingDeadline(false)}
                                                        saving={savingCard}
                                                    />
                                                ) : null
                                            }
                                        >
                                            {editingDeadline ? (
                                                <input
                                                    type="datetime-local"
                                                    value={draftDeadline}
                                                    onChange={(e) => setDraftDeadline(e.target.value)}
                                                    autoFocus
                                                    className="h-9 w-full rounded-full bg-white/[0.06] border border-violet-500/40 px-3 text-[13px] text-zinc-300 outline-none focus:border-violet-500"
                                                />
                                            ) : (
                                                <span className="text-[14px] font-semibold text-zinc-200">
                                                    {formatDate(localTask.deadline)}
                                                </span>
                                            )}
                                        </Card>

                                        <Card
                                            title="Tài chính"
                                            rightSlot={
                                                isAdmin && !editingFinance ? (
                                                    <EditButton onClick={enterEditFinance} />
                                                ) : editingFinance ? (
                                                    <ConfirmCancelGroup
                                                        onConfirm={handleSaveFinance}
                                                        onCancel={() => setEditingFinance(false)}
                                                        saving={savingCard}
                                                    />
                                                ) : null
                                            }
                                        >
                                            {editingFinance && isAdmin ? (
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-[12px] text-zinc-400">Khách ($)</span>
                                                        <input
                                                            type="number"
                                                            value={draftFinance.jobPriceUSD}
                                                            onChange={(e) => setDraftFinance(d => ({ ...d, jobPriceUSD: Number(e.target.value) }))}
                                                            autoFocus
                                                            className="w-28 h-8 rounded-full bg-white/[0.06] border border-violet-500/40 px-3 text-[13px] text-zinc-200 text-right outline-none focus:border-violet-500"
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-[12px] text-zinc-400">Nhân viên (VND)</span>
                                                        <input
                                                            type="number"
                                                            value={draftFinance.value}
                                                            onChange={(e) => setDraftFinance(d => ({ ...d, value: Number(e.target.value) }))}
                                                            className="w-32 h-8 rounded-full bg-white/[0.06] border border-violet-500/40 px-3 text-[13px] text-zinc-200 text-right outline-none focus:border-violet-500"
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2">
                                                    {/* [Sprint J P0] Client ($) = agency revenue. ADMIN-ONLY display.
                                                        Non-admin (staff) chỉ thấy Staff (VND) — lương riêng của họ. */}
                                                    {isAdmin && (
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[12px] text-zinc-400">Khách ($)</span>
                                                            <span className="text-[14px] font-bold text-emerald-400">
                                                                $ {Number(form.jobPriceUSD || 0).toLocaleString('en-US')}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[12px] text-zinc-400">Nhân viên (VND)</span>
                                                        <span className="text-[14px] font-bold text-zinc-200">
                                                            VND {Number(form.value || 0).toLocaleString('vi-VN')}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </Card>
                                    </div>
                                </div>
                            )}

                            {/* TAB ASSETS */}
                            {activeTab === 'assets' &&
                                (showMapPanel && hookGraph ? (
                                    /* [Hook Graph] Map panel — opened from the RAW Assets row.
                                       Has a "← Quay lại" button back to the Resources grid. */
                                    <Card
                                        title="🗺 Multi-Hook Map"
                                        rightSlot={
                                            <div className="flex items-center gap-2">
                                                {isAdmin &&
                                                    (editingMap ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={handleCancelMap}
                                                                className="rounded-lg px-2.5 py-1 text-[12px] text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                                                            >
                                                                Hủy
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={handleSaveMap}
                                                                disabled={savingMap}
                                                                className="rounded-lg bg-violet-600 px-3 py-1 text-[12px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                                                            >
                                                                {savingMap ? 'Đang lưu…' : 'Lưu map'}
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={handleEditMap}
                                                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-medium text-violet-300 hover:bg-violet-500/15"
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" /> Sửa map
                                                        </button>
                                                    ))}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (editingMap) handleCancelMap()
                                                        setShowMapPanel(false)
                                                    }}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[12px] font-medium text-zinc-300 hover:bg-white/10 hover:text-white"
                                                >
                                                    ← Quay lại
                                                </button>
                                            </div>
                                        }
                                    >
                                        {editingMap ? (
                                            <HookGraphEditor
                                                initialGraph={editGraph ?? hookGraph}
                                                onChange={setEditGraph}
                                                height={460}
                                            />
                                        ) : (
                                            <HookGraphViewer graph={hookGraph} height={440} />
                                        )}
                                    </Card>
                                ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <Card title="Tài nguyên">
                                        <div className="flex flex-col">
                                            {hookGraph ? (
                                                /* [Hook Graph] RAW Assets holds a Multi-Hook Map —
                                                   show a "configured" pill that opens the map panel. */
                                                <button
                                                    type="button"
                                                    onClick={() => setShowMapPanel(true)}
                                                    title="Mở sơ đồ Multi-hook Map"
                                                    className="group flex w-full items-center justify-between gap-3 border-b border-white/5 py-2 text-left last:border-0"
                                                >
                                                    <span className="flex-shrink-0 text-[12px] font-medium text-zinc-300">
                                                        File RAW
                                                    </span>
                                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[12px] font-semibold text-violet-300 transition-colors group-hover:bg-violet-500/20">
                                                        🗺 Multi-hook Map · {hookGraph.blocks.length} block
                                                        <span className="text-violet-400">→</span>
                                                    </span>
                                                </button>
                                            ) : (
                                                <LinkRow
                                                    label="File RAW"
                                                    value={form.linkRaw}
                                                    canEdit={isAdmin}
                                                    onSave={(v) => saveResource('linkRaw', v)}
                                                />
                                            )}
                                            <LinkRow
                                                label="File B-Roll"
                                                value={form.linkBroll}
                                                canEdit={isAdmin}
                                                onSave={(v) => saveResource('linkBroll', v)}
                                            />
                                            <LinkRow
                                                label="Kịch bản"
                                                value={form.scriptLink}
                                                canEdit={isAdmin}
                                                onSave={(v) => saveResource('scriptLink', v)}
                                            />
                                            <LinkRow
                                                label="Thư mục nộp bài"
                                                value={form.submissionFolder}
                                                canEdit={isAdmin}
                                                onSave={(v) => saveResource('submissionFolder', v)}
                                            />
                                        </div>
                                    </Card>

                                    <Card title="Tham khảo">
                                        <div className="flex flex-col">
                                            <LinkRow
                                                label="Tài liệu tham khảo"
                                                value={form.references}
                                                canEdit={isAdmin}
                                                onSave={(v) => saveReference('references', v)}
                                            />
                                            <LinkRow
                                                label="Dự án mẫu"
                                                value={form.collectFilesLink}
                                                canEdit={isAdmin}
                                                onSave={(v) => saveReference('collectFilesLink', v)}
                                            />
                                        </div>
                                    </Card>
                                </div>
                                ))}

                            {/* TAB NOTES */}
                            {/* [Trial] GHI CHÚ — không còn là tab; luôn hiển thị dưới nội dung
                                tab ("Chính" / "Tài nguyên" vẫn switch qua lại ở trên). */}
                            <div className="mt-5 pt-5 border-t border-white/5">
                                <Card
                                    title="Ghi chú"
                                    rightSlot={
                                        isAdmin && !editingNotes ? (
                                            <EditButton onClick={enterEditNotes} />
                                        ) : editingNotes ? (
                                            <ConfirmCancelGroup
                                                onConfirm={handleSaveNotes}
                                                onCancel={() => setEditingNotes(false)}
                                                saving={savingCard}
                                            />
                                        ) : null
                                    }
                                >
                                    {editingNotes ? (
                                        <div className="rounded-xl overflow-hidden border border-white/5 bg-white/[0.02] min-h-[260px]">
                                            <TiptapEditor
                                                content={draftNotes}
                                                onChange={(html) => setDraftNotes(html)}
                                            />
                                        </div>
                                    ) : form.notes?.trim() ? (
                                        <div
                                            className="prose prose-invert prose-sm max-w-none text-zinc-300 leading-relaxed min-h-[200px]"
                                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(form.notes) }}
                                        />
                                    ) : (
                                        <p className="text-[13px] text-zinc-600 min-h-[200px]">Chưa có ghi chú nào.</p>
                                    )}
                                </Card>
                            </div>

                        </div>

                          </>
                        )}

                        </div>{/* end LEFT column */}

                        {/* [Trial P1] RIGHT column — ClickUp-style comment + activity feed */}
                        {task && (
                            <div style={{ width: 400, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', zIndex: 1, background: 'rgba(0,0,0,0.22)' }}>
                                <TaskCommentColumn taskId={task.id} workspaceId={workspaceId} />
                            </div>
                        )}
                    </motion.div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </Dialog>
    )
}
