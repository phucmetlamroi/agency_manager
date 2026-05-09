"use client"

import React, { useState, useEffect } from "react"
import { TaskWithUser } from "@/types/admin"
import { updateTaskDetails } from "@/actions/update-task-details"
import { toast } from "sonner"
import { Dialog } from "@/components/ui/dialog"
import dynamic from 'next/dynamic'
import DOMPurify from 'isomorphic-dompurify'
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import {
    X, Pencil, LayoutGrid, FolderOpen, StickyNote, ExternalLink, Check, Plus,
} from "lucide-react"
import * as DialogPrimitive from "@radix-ui/react-dialog"

const TiptapEditor = dynamic(() => import('@/components/tiptap/TiptapEditor'), { ssr: false })

/* ────────────────────────────────────────────────────────────────────── */
/*  Status / Type maps                                                     */
/* ────────────────────────────────────────────────────────────────────── */

const STATUS_COLORS: Record<string, { label: string; color: string; bg: string }> = {
    'Nhận task': { label: 'Nhận task', color: '#3B82F6', bg: 'rgba(59,130,246,0.10)' },
    'Đã nhận task': { label: 'Đã nhận task', color: '#3B82F6', bg: 'rgba(59,130,246,0.10)' },
    'Đang đợi giao': { label: 'Đang đợi giao', color: '#A855F7', bg: 'rgba(168,85,247,0.10)' },
    'Đang thực hiện': { label: 'Progress', color: '#EAB308', bg: 'rgba(234,179,8,0.10)' },
    'Revision': { label: 'Revision', color: '#EF4444', bg: 'rgba(239,68,68,0.10)' },
    'Sửa frame': { label: 'Sửa frame', color: '#EC4899', bg: 'rgba(236,72,153,0.10)' },
    'Gửi lại': { label: 'Gửi lại', color: '#F97316', bg: 'rgba(249,115,22,0.10)' },
    'Tạm ngưng': { label: 'Tạm ngưng', color: '#71717A', bg: 'rgba(113,113,122,0.10)' },
    'Hoàn tất': { label: 'Complete', color: '#10B981', bg: 'rgba(16,185,129,0.10)' },
    'Quá hạn': { label: 'Overdue', color: '#DC2626', bg: 'rgba(220,38,38,0.10)' },
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
    return `${dt.getFullYear()} - ${pad(dt.getMonth() + 1)} - ${pad(dt.getDate())}`
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
            {type}
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
    activeTab: 'main' | 'assets' | 'notes'
    onChange: (tab: 'main' | 'assets' | 'notes') => void
}) {
    const tabs = [
        { id: 'main' as const, label: 'Main', icon: LayoutGrid },
        { id: 'assets' as const, label: 'Assets', icon: FolderOpen },
        { id: 'notes' as const, label: 'Notes', icon: StickyNote },
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
                    placeholder="Paste link…"
                    className="flex-1 h-8 rounded-full bg-white/[0.06] border border-violet-500/40 px-3 text-[12px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-violet-500"
                />
                <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={saving}
                    title="Confirm"
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-[#8B5CF6] hover:bg-[#A855F7] text-white disabled:opacity-50 transition-colors"
                >
                    <Check size={13} strokeWidth={3} />
                </button>
                <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={saving}
                    title="Cancel"
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
                        <span className="truncate">View {label}</span>
                        <ExternalLink size={11} className="flex-shrink-0" />
                    </a>
                ) : canEdit ? (
                    <button
                        type="button"
                        onClick={startEdit}
                        className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-violet-300 transition-colors"
                    >
                        <Plus size={11} />
                        Add link
                    </button>
                ) : (
                    <span className="text-[12px] text-zinc-600">None</span>
                )}
                {canEdit && value?.trim() && (
                    <button
                        type="button"
                        onClick={startEdit}
                        title="Edit"
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
    return (
        <button
            type="button"
            onClick={onClick}
            title={title ?? "Edit"}
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
                title="Confirm"
                className="w-7 h-7 flex items-center justify-center rounded-full bg-[#8B5CF6] hover:bg-[#A855F7] text-white disabled:opacity-50 transition-colors"
            >
                <Check size={13} strokeWidth={3} />
            </button>
            <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                title="Cancel"
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
}

export function TaskDetailModal({
    task,
    isOpen,
    onClose,
    isAdmin,
    workspaceId,
}: TaskDetailModalProps) {
    const [activeTab, setActiveTab] = useState<'main' | 'assets' | 'notes'>('main')
    const [localTask, setLocalTask] = useState<TaskWithUser | null>(null)

    // Per-card edit states (only one open at a time, but state per card)
    const [editingDelivery, setEditingDelivery] = useState(false)
    const [editingDeadline, setEditingDeadline] = useState(false)
    const [editingFinance, setEditingFinance] = useState(false)
    const [editingNotes, setEditingNotes] = useState(false)
    const [savingCard, setSavingCard] = useState(false)

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
    }, [task])

    if (!isOpen || !localTask) return null

    /* ── Generic per-field save ── */
    const saveSingle = async (
        patch: Parameters<typeof updateTaskDetails>[1],
        successMsg = 'Updated',
    ) => {
        const res = await updateTaskDetails(localTask.id, patch, workspaceId)
        if (res?.success) {
            toast.success(successMsg)
            return true
        }
        toast.error('Save failed')
        return false
    }

    /* ── Resources card: re-pack + save ── */
    const saveResource = async (key: 'linkRaw' | 'linkBroll' | 'scriptLink' | 'submissionFolder', newValue: string) => {
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
    const handleSaveDelivery = async () => {
        setSavingCard(true)
        const ok = await saveSingle({ productLink: draftDelivery })
        if (ok) {
            setForm((p) => ({ ...p, productLink: draftDelivery }))
            setLocalTask((p) => (p ? { ...p, productLink: draftDelivery } : null))
            setEditingDelivery(false)
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

    /* ── Edit mode entry helpers (set drafts from current form) ── */
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
                        className="fixed left-1/2 top-1/2 flex flex-col outline-none"
                        style={{
                            zIndex: 9999,
                            width: 720,
                            maxWidth: 'calc(100vw - 32px)',
                            maxHeight: '90vh',
                            borderRadius: 24,
                            background: 'rgba(10,10,10,0.95)',
                            border: '1px solid rgba(139,92,246,0.15)',
                            backdropFilter: 'blur(24px)',
                            boxShadow: '0 32px 80px rgba(0,0,0,0.70)',
                            x: '-50%',
                            y: '-50%',
                        }}
                        initial={{ opacity: 0, scale: 0.96, y: '-48%', x: '-50%' }}
                        animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%' }}
                        exit={{ opacity: 0, scale: 0.96, y: '-48%', x: '-50%' }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
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

                        {/* HEADER */}
                        <div className="flex flex-col gap-3 px-6 pt-6 pb-3 border-b border-white/5 relative z-[1]">
                            <div className="flex items-center justify-between">
                                <h2 className="text-[16px] font-extrabold text-white">Task Details</h2>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.10] text-zinc-400 hover:text-white transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="flex flex-col gap-2">
                                <h3 className="text-[18px] font-extrabold text-white tracking-tight truncate">
                                    {localTask.title}
                                </h3>
                                <p className="text-[12px] text-zinc-400">
                                    Follow-up: <span className="text-zinc-300">{formatDate(localTask.deadline)}</span>
                                </p>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <StatusPill status={localTask.status} />
                                    {localTask.type && <TypePill type={localTask.type} />}
                                </div>
                            </div>
                        </div>

                        {/* TAB NAV */}
                        <TabNav activeTab={activeTab} onChange={setActiveTab} />

                        {/* TAB CONTENT */}
                        <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar relative z-[1]">
                            {/* TAB MAIN */}
                            {activeTab === 'main' && (
                                <div className="grid grid-cols-2 gap-4">
                                    {/* DELIVERY card */}
                                    <Card
                                        title="Delivery"
                                        className="min-h-[220px]"
                                        rightSlot={
                                            isAdmin && !editingDelivery ? (
                                                <EditButton onClick={enterEditDelivery} />
                                            ) : editingDelivery ? (
                                                <ConfirmCancelGroup
                                                    onConfirm={handleSaveDelivery}
                                                    onCancel={() => setEditingDelivery(false)}
                                                    saving={savingCard}
                                                />
                                            ) : null
                                        }
                                    >
                                        {editingDelivery ? (
                                            <textarea
                                                value={draftDelivery}
                                                onChange={(e) => setDraftDelivery(e.target.value)}
                                                placeholder="Paste delivery link or status note…"
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
                                                    <span>View delivery</span>
                                                    <ExternalLink size={12} className="flex-shrink-0" />
                                                </a>
                                            ) : (
                                                <p className="text-[13px] text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                                    {form.productLink}
                                                </p>
                                            )
                                        ) : isAdmin ? (
                                            <button
                                                type="button"
                                                onClick={enterEditDelivery}
                                                className="self-start inline-flex items-center gap-1 text-[12px] text-zinc-500 hover:text-violet-300 transition-colors"
                                            >
                                                <Plus size={12} /> Add delivery link
                                            </button>
                                        ) : (
                                            <p className="text-[13px] text-zinc-600">Final products are pending.</p>
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
                                            title="Finance"
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
                                                        <span className="text-[12px] text-zinc-400">Client ($)</span>
                                                        <input
                                                            type="number"
                                                            value={draftFinance.jobPriceUSD}
                                                            onChange={(e) => setDraftFinance(d => ({ ...d, jobPriceUSD: Number(e.target.value) }))}
                                                            autoFocus
                                                            className="w-28 h-8 rounded-full bg-white/[0.06] border border-violet-500/40 px-3 text-[13px] text-zinc-200 text-right outline-none focus:border-violet-500"
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-[12px] text-zinc-400">Staff (VND)</span>
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
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[12px] text-zinc-400">Client ($)</span>
                                                        <span className="text-[14px] font-bold text-emerald-400">
                                                            $ {Number(form.jobPriceUSD || 0).toLocaleString('en-US')}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[12px] text-zinc-400">Staff (VND)</span>
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
                            {activeTab === 'assets' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <Card title="Resources">
                                        <div className="flex flex-col">
                                            <LinkRow
                                                label="RAW Assets"
                                                value={form.linkRaw}
                                                canEdit={isAdmin}
                                                onSave={(v) => saveResource('linkRaw', v)}
                                            />
                                            <LinkRow
                                                label="B-Roll Assets"
                                                value={form.linkBroll}
                                                canEdit={isAdmin}
                                                onSave={(v) => saveResource('linkBroll', v)}
                                            />
                                            <LinkRow
                                                label="View Script"
                                                value={form.scriptLink}
                                                canEdit={isAdmin}
                                                onSave={(v) => saveResource('scriptLink', v)}
                                            />
                                            <LinkRow
                                                label="Submission Folder"
                                                value={form.submissionFolder}
                                                canEdit={isAdmin}
                                                onSave={(v) => saveResource('submissionFolder', v)}
                                            />
                                        </div>
                                    </Card>

                                    <Card title="References">
                                        <div className="flex flex-col">
                                            <LinkRow
                                                label="View Reference"
                                                value={form.references}
                                                canEdit={isAdmin}
                                                onSave={(v) => saveReference('references', v)}
                                            />
                                            <LinkRow
                                                label="Sample Project"
                                                value={form.collectFilesLink}
                                                canEdit={isAdmin}
                                                onSave={(v) => saveReference('collectFilesLink', v)}
                                            />
                                        </div>
                                    </Card>
                                </div>
                            )}

                            {/* TAB NOTES */}
                            {activeTab === 'notes' && (
                                <Card
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
                                        <p className="text-[13px] text-zinc-600 min-h-[200px]">No notes added.</p>
                                    )}
                                </Card>
                            )}
                        </div>
                    </motion.div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </Dialog>
    )
}
